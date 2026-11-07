import { Agent, request as httpsRequest } from 'https';
import { PeerCertificate } from 'tls';
import { IncaRejectedError, IncaUnavailableError } from '../inca.types';
import { parseLoginResponse, safeIncaMessage } from './inca-live.mappers';

export type IncaTransportConfig = {
  /** e.g. https://172.17.9.2/api — always HTTPS. */
  baseUrl: string;
  username: string;
  password: string;
  /** PEM of the certificate(s) INCA is trusted with; replaces the public CA store. */
  caPem: string;
  /** SHA-256 fingerprint the INCA certificate must have (AA:BB:...). */
  fingerprint256: string;
  timeoutMs: number;
  maxConcurrent: number;
};

type IncaMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type IncaWireRequest = {
  method: IncaMethod;
  url: URL;
  headers: Record<string, string>;
  body?: string;
};

export type IncaWireResponse = { status: number; body: string };

export type IncaSender = (
  request: IncaWireRequest,
) => Promise<IncaWireResponse>;

type Session = { token: string; userId: number; refreshAt: number };

type Logger = {
  warn(context: string, message: string): void;
  error(context: string, message: string): void;
  log(context: string, message: string): void;
};

const LOG = 'INCA';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
/** Renew this long before the token expires so a request never races the expiry. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
/** After a refused login, wait before trying again so INCA never locks the account. */
const LOGIN_COOLDOWN_MS = 60 * 1000;
const PATH_PATTERN = /^\/[A-Za-z0-9/_-]+$/;

export function normalizeFingerprint(value: string): string {
  const hex = value.replace(/[^0-9a-f]/gi, '').toUpperCase();
  return hex.match(/.{2}/g)?.join(':') ?? '';
}

/**
 * HTTPS sender that trusts only the configured INCA certificate. The check runs during the
 * TLS handshake, so nothing (credentials included) is written to a server that fails it.
 */
export function createPinnedSender(config: IncaTransportConfig): IncaSender {
  const pin = normalizeFingerprint(config.fingerprint256);
  const agent = new Agent({
    ca: config.caPem,
    rejectUnauthorized: true,
    keepAlive: true,
    maxSockets: config.maxConcurrent,
    // INCA's self-signed certificate names its host, not the IP we dial; the pin replaces
    // the hostname check and is stricter than it.
    checkServerIdentity: (_host: string, cert: PeerCertificate) =>
      normalizeFingerprint(cert.fingerprint256 ?? '') === pin
        ? undefined
        : new Error('INCA certificate does not match INCA_TLS_FINGERPRINT'),
  });

  return (wire) =>
    new Promise<IncaWireResponse>((resolve, reject) => {
      const req = httpsRequest(
        wire.url,
        { method: wire.method, headers: wire.headers, agent },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              req.destroy(
                new IncaUnavailableError('INCA response was too large'),
              );
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
          res.on('error', reject);
        },
      );
      req.setTimeout(config.timeoutMs, () =>
        req.destroy(new IncaUnavailableError('INCA did not respond in time')),
      );
      req.on('error', (error) =>
        reject(
          error instanceof IncaUnavailableError
            ? error
            : new IncaUnavailableError(
                `INCA connection failed (${connectionReason(error)})`,
              ),
        ),
      );
      if (wire.body !== undefined) req.write(wire.body);
      req.end();
    });
}

/** Socket error codes only: messages can echo request details. */
function connectionReason(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
  return error instanceof Error && /certificate/i.test(error.message)
    ? 'certificate rejected'
    : 'network error';
}

/**
 * Session-aware INCA API access. Credentials live only here; the token is kept in memory,
 * sent only in the X-Access-Token header (never in URLs) and never logged or returned.
 */
export class IncaTransport {
  private session: Session | null = null;
  private loginInFlight: Promise<Session> | null = null;
  private loginBlockedUntil = 0;
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly base: URL;

  constructor(
    private readonly config: IncaTransportConfig,
    private readonly send: IncaSender,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.base = new URL(config.baseUrl.replace(/\/+$/, ''));
    if (this.base.protocol !== 'https:') {
      throw new Error('INCA_BASE_URL must use https');
    }
  }

  /** INCA user id of the Ticketify account (scopes per-user views such as service areas). */
  async userId(): Promise<number> {
    return (await this.ensureSession()).userId;
  }

  async get<T>(path: string, filter?: Record<string, unknown>): Promise<T> {
    return this.call<T>('GET', path, filter, undefined);
  }

  /** Never retried on failure: a lost response may still have been applied by INCA. */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.call<T>('POST', path, undefined, body);
  }

  /** Never retried on failure, like POST. */
  async patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.call<T>('PATCH', path, undefined, body);
  }

  /** Never retried on failure, like POST. */
  async delete<T>(path: string): Promise<T> {
    return this.call<T>('DELETE', path, undefined, undefined);
  }

  private async call<T>(
    method: IncaMethod,
    path: string,
    filter: Record<string, unknown> | undefined,
    body: Record<string, unknown> | undefined,
  ): Promise<T> {
    const url = this.url(path, filter);
    return this.limited(async () => {
      let session = await this.ensureSession();
      let response = await this.exchange(method, url, session, body);
      if (response.status === 401) {
        // 401 means INCA did not act on the request, so one replay with a fresh token is safe.
        this.invalidate(session);
        session = await this.ensureSession();
        response = await this.exchange(method, url, session, body);
      }
      return this.interpret<T>(method, url, response);
    });
  }

  private exchange(
    method: IncaMethod,
    url: URL,
    session: Session,
    body: Record<string, unknown> | undefined,
  ) {
    return this.send({
      method,
      url,
      headers: {
        Accept: 'application/json',
        'X-Access-Token': session.token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private interpret<T>(
    method: string,
    url: URL,
    response: IncaWireResponse,
  ): T {
    const { status } = response;
    if (status >= 200 && status < 300) {
      if (!response.body.trim()) return null as T;
      try {
        return JSON.parse(response.body) as T;
      } catch {
        throw new IncaUnavailableError('INCA returned an unreadable response');
      }
    }
    const reason = safeIncaMessage(response.body);
    this.logger.warn(
      LOG,
      `${method} ${url.pathname} failed (${status})${reason ? `: ${reason}` : ''}`,
    );
    if (status === 401) {
      throw new IncaUnavailableError('INCA rejected the Ticketify session');
    }
    if (status === 403) {
      throw new IncaRejectedError(
        'INCA does not allow this action for the Ticketify account',
      );
    }
    if (status >= 400 && status < 500) {
      throw new IncaRejectedError(
        reason || `INCA rejected the request (${status})`,
      );
    }
    throw new IncaUnavailableError(`INCA error (${status})`);
  }

  private url(path: string, filter?: Record<string, unknown>): URL {
    if (!PATH_PATTERN.test(path) || path.includes('..')) {
      throw new Error('Rejected unsafe INCA path');
    }
    const url = new URL(this.base.href);
    url.pathname = `${this.base.pathname.replace(/\/+$/, '')}${path}`;
    if (filter) url.searchParams.set('filter', JSON.stringify(filter));
    return url;
  }

  private async ensureSession(): Promise<Session> {
    if (this.session && this.now() < this.session.refreshAt) {
      return this.session;
    }
    this.loginInFlight ??= this.login().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private invalidate(stale: Session) {
    if (this.session === stale) this.session = null;
  }

  private async login(): Promise<Session> {
    if (this.now() < this.loginBlockedUntil) {
      throw new IncaUnavailableError(
        'INCA login is cooling down after a refused attempt',
      );
    }
    const url = this.url('/inca-users/login');
    const response = await this.send({
      method: 'POST',
      url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
    });
    if (response.status < 200 || response.status >= 300) {
      if (response.status >= 400 && response.status < 500) {
        this.loginBlockedUntil = this.now() + LOGIN_COOLDOWN_MS;
        this.logger.error(
          LOG,
          `Login refused (${response.status}); check INCA_USERNAME / INCA_PASSWORD`,
        );
        throw new IncaUnavailableError('INCA refused the Ticketify login');
      }
      this.logger.error(LOG, `Login failed (${response.status})`);
      throw new IncaUnavailableError(`INCA login failed (${response.status})`);
    }
    let parsed: ReturnType<typeof parseLoginResponse>;
    try {
      parsed = parseLoginResponse(JSON.parse(response.body), this.now());
    } catch {
      parsed = null;
    }
    if (!parsed) {
      this.logger.error(LOG, 'Login response did not contain a usable token');
      throw new IncaUnavailableError('INCA login returned no session');
    }
    const session: Session = {
      token: parsed.token,
      userId: parsed.userId,
      refreshAt:
        parsed.expiresAt -
        Math.min(
          REFRESH_MARGIN_MS,
          Math.max(0, parsed.expiresAt - this.now()) / 2,
        ),
    };
    this.session = session;
    this.loginBlockedUntil = 0;
    this.logger.log(LOG, `Signed in as INCA user ${session.userId}`);
    return session;
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    while (this.active >= this.config.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
