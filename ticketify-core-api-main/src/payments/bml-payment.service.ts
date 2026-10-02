import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { consumeWebhookNonce } from './webhook-nonce.store';

const CONFIRMED_STATES = new Set(['CONFIRMED']);
const FAILED_STATES = new Set(['FAILED', 'CANCELLED', 'EXPIRED', 'VOIDED']);
/** States after which the BML transaction can never be paid. */
const CLOSED_STATES = new Set(['CANCELLED', 'EXPIRED', 'VOIDED']);
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export type BmlTransactionView = {
  id: string | null;
  localId: string | null;
  state: string;
  url: string | null;
  shortUrl: string | null;
  qrImageUrl: string | null;
  amount: number | null;
  currency: string | null;
  allowRetry: boolean | null;
  expiresAt: string | null;
  /** Full gateway payload. Contains card/token data — never persist or return it. */
  raw: unknown;
};

/** The only BML fields Ticketify stores; everything else (card, token, IP) is dropped. */
export type StoredBmlTransaction = {
  id: string | null;
  local_id: string | null;
  state: string;
  amount_minor: number | null;
  currency: string | null;
  pay_url: string | null;
  expires_at: string | null;
  checked_at: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

@Injectable()
export class BmlPaymentService {
  constructor(private config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('BML_ENABLED') === 'true';
  }

  /** Auth token or API key plus redirect URL — minimum to call BML. */
  isConfigured(): boolean {
    const auth =
      this.config.get<string>('BML_AUTH_TOKEN')?.trim() ||
      this.config.get<string>('BML_API_KEY')?.trim();
    const redirect = this.config.get<string>('BML_REDIRECT_URL')?.trim();
    return Boolean(auth && redirect);
  }

  canUseGateway(): boolean {
    return this.isEnabled() && this.isConfigured();
  }

  /** Invoice + SMS without live BML (development / explicit opt-in). */
  allowInvoiceWithoutGateway(): boolean {
    if (this.canUseGateway()) return false;
    if (this.config.get<string>('BML_INVOICE_WITHOUT_GATEWAY') === 'true') {
      return true;
    }
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    return nodeEnv !== 'production';
  }

  toMinorUnits(amountMvr: number): number {
    return Math.round(Number(amountMvr) * 100);
  }

  fromMinorUnits(amountMinor: number): number {
    return Math.round(Number(amountMinor)) / 100;
  }

  generateV1RequestSignature(
    amountMinor: number,
    currency: string,
    apiKey: string,
    signMethod = 'sha1',
  ): string {
    const signString = `amount=${amountMinor}&currency=${currency}&apiKey=${apiKey}`;

    if (signMethod === 'md5') {
      return crypto
        .createHash('md5')
        .update(signString, 'utf8')
        .digest('base64');
    }

    return crypto.createHash('sha1').update(signString, 'utf8').digest('hex');
  }

  verifyWebhookHeaders(
    headers: Record<string, string | string[] | undefined>,
    apiKey?: string,
  ): boolean {
    const key = apiKey ?? this.config.get<string>('BML_API_KEY') ?? '';
    if (!key) return false;

    const nonce =
      (headers['x-signature-nonce'] as string) ||
      (headers['X-Signature-Nonce'] as string) ||
      '';
    const timestamp =
      (headers['x-signature-timestamp'] as string) ||
      (headers['X-Signature-Timestamp'] as string) ||
      '';
    const signature =
      (headers['x-signature'] as string) ||
      (headers['X-Signature'] as string) ||
      '';

    if (!nonce || !timestamp || !signature) return false;

    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs)) return false;
    if (Math.abs(Date.now() - timestampMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
      return false;
    }

    const expected = crypto
      .createHash('sha256')
      .update(`${nonce}${timestamp}${key}`, 'utf8')
      .digest('hex');

    if (!timingSafeEqual(expected, signature)) return false;
    if (!consumeWebhookNonce(nonce)) return false;

    return true;
  }

  verifyLegacyWebhookPayload(payload: Record<string, unknown>): boolean {
    const apiKey = this.config.get<string>('BML_API_KEY') ?? '';
    if (!apiKey || !payload) return false;

    const originalSignature = payload.originalSignature as string | undefined;
    const amount = payload.amount;
    const currency = payload.currency as string | undefined;

    if (!originalSignature || amount == null || !currency) return false;

    const signString = `amount=${amount}&currency=${currency}&apiKey=${apiKey}`;
    const expected = crypto
      .createHash('md5')
      .update(signString, 'utf8')
      .digest('base64');

    return timingSafeEqual(expected, originalSignature);
  }

  isPaymentConfirmed(state: string | null | undefined): boolean {
    return CONFIRMED_STATES.has(String(state || '').toUpperCase());
  }

  isPaymentFailed(state: string | null | undefined): boolean {
    return FAILED_STATES.has(String(state || '').toUpperCase());
  }

  /**
   * True when the customer can no longer pay this BML transaction. A FAILED card
   * attempt is retryable on the same link unless BML says otherwise.
   */
  isTerminalFailure(
    view: Pick<BmlTransactionView, 'state' | 'allowRetry'>,
  ): boolean {
    const state = String(view.state || '').toUpperCase();
    if (CLOSED_STATES.has(state)) return true;
    return state === 'FAILED' && view.allowRetry === false;
  }

  isClosedState(state: string | null | undefined): boolean {
    return CLOSED_STATES.has(String(state || '').toUpperCase());
  }

  toStored(view: BmlTransactionView): StoredBmlTransaction {
    return {
      id: view.id,
      local_id: view.localId,
      state: view.state,
      amount_minor:
        view.amount != null ? Math.round(Number(view.amount)) : null,
      currency: view.currency,
      pay_url: this.pickPayUrl(view),
      expires_at: view.expiresAt,
      checked_at: new Date().toISOString(),
    };
  }

  /**
   * Same as medianet-voucher: raw JWT or API key in Authorization — do not prepend Bearer.
   * BML returns 401 (PP-C-004) if Bearer is added to a JWT.
   */
  private authorizationHeader(): string {
    const authToken = this.config.get<string>('BML_AUTH_TOKEN')?.trim();
    const apiKey = this.config.get<string>('BML_API_KEY')?.trim();
    const authorization = authToken || apiKey;
    if (!authorization) {
      throw new ServiceUnavailableException(
        'BML payment gateway is not configured',
      );
    }
    return authorization.replace(/^Bearer\s+/i, '');
  }

  buildRedirectUrl(localReference: string): string {
    const base = this.config.get<string>('BML_REDIRECT_URL')?.trim();
    if (!base) {
      throw new ServiceUnavailableException(
        'BML redirect URL is not configured',
      );
    }
    const url = new URL(base);
    url.searchParams.set('reference', localReference);
    return url.toString();
  }

  /** Customer-facing pay URL from BML create/get response. */
  pickPayUrl(view: BmlTransactionView): string | null {
    return view.shortUrl?.trim() || view.url?.trim() || null;
  }

  private async bmlRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const apiBaseUrl =
      this.config.get<string>('BML_API_BASE_URL') ??
      'https://api.merchants.bankofmaldives.com.mv';

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: this.authorizationHeader(),
    };

    const appId = this.config.get<string>('BML_APP_ID');
    if (appId && this.config.get('BML_SEND_APP_ID_HEADER') === 'true') {
      headers['X-App-Id'] = appId;
    }

    const url = `${apiBaseUrl.replace(/\/$/, '')}${path}`;
    const timeoutMs = Number(
      this.config.get('BML_REQUEST_TIMEOUT_MS') ?? 30000,
    );
    // Only reads are retried; retrying a create could open a second transaction.
    const attempts = method === 'GET' ? 2 : 1;

    let response: Response | null = null;
    for (let attempt = 1; attempt <= attempts && !response; attempt++) {
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body != null ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (attempt === attempts) {
          throw new ServiceUnavailableException(
            'Unable to reach the payment gateway',
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!response) {
      throw new ServiceUnavailableException(
        'Unable to reach the payment gateway',
      );
    }

    let data: Record<string, unknown> = {};
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
    } else {
      const text = await response.text().catch(() => '');
      if (text) {
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          data = { message: text };
        }
      }
    }

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new ServiceUnavailableException(
          `Payment gateway is temporarily unavailable (${response.status})`,
        );
      }
      throw new BadRequestException(
        (data.message as string) ||
          `BML payment request failed (${response.status})`,
      );
    }

    return data;
  }

  private normalizeTransactionResponse(
    data: Record<string, unknown>,
  ): BmlTransactionView {
    const nested =
      (data.transaction as Record<string, unknown> | undefined) ??
      (data.data as Record<string, unknown> | undefined) ??
      data;
    const qr =
      (nested.qr as { url?: string } | undefined) ??
      (data.qr as { url?: string } | undefined);
    const links = nested.links as Record<string, string> | undefined;
    return {
      id:
        (nested.id as string) ||
        (nested.transactionId as string) ||
        (data.id as string) ||
        null,
      localId:
        (nested.localId as string) ||
        (nested.local_id as string) ||
        (data.localId as string) ||
        null,
      state: String(
        nested.state || nested.status || data.state || data.status || '',
      ).toUpperCase(),
      url:
        (nested.url as string) ||
        (nested.paymentUrl as string) ||
        links?.payment ||
        links?.url ||
        (data.url as string) ||
        null,
      shortUrl:
        (nested.shortUrl as string) ||
        (nested.short_url as string) ||
        links?.shortUrl ||
        links?.short ||
        (data.shortUrl as string) ||
        null,
      qrImageUrl: qr?.url ?? null,
      amount: (nested.amount as number) ?? (data.amount as number) ?? null,
      currency:
        (nested.currency as string) || (data.currency as string) || null,
      allowRetry:
        typeof nested.allowRetry === 'boolean' ? nested.allowRetry : null,
      expiresAt: (nested.expires as string) || null,
      raw: data,
    };
  }

  async getPaymentTransaction(
    transactionId: string,
  ): Promise<BmlTransactionView> {
    const data = (await this.bmlRequest(
      'GET',
      `/public/transactions/${encodeURIComponent(transactionId)}`,
    )) as Record<string, unknown>;
    return this.normalizeTransactionResponse(data);
  }

  async createPaymentTransaction(input: {
    localId: string;
    amountMvr: number;
    currency?: string;
    customerReference?: string;
    redirectUrl?: string;
    webhookUrl?: string;
  }): Promise<BmlTransactionView> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('BML payment gateway is disabled');
    }

    const currency = input.currency ?? 'MVR';
    const amountMinor = this.toMinorUnits(input.amountMvr);
    const redirect = input.redirectUrl ?? this.buildRedirectUrl(input.localId);
    if (!redirect?.trim()) {
      throw new ServiceUnavailableException(
        'BML redirect URL is not configured',
      );
    }

    const apiMode = this.config.get<string>('BML_API_MODE') ?? 'v1';
    const webhook =
      input.webhookUrl ??
      this.config.get<string>('BML_WEBHOOK_URL') ??
      undefined;
    const customerRef =
      input.customerReference ?? `Ticketify payment ${input.localId}`;

    if (apiMode === 'v2') {
      const payload: Record<string, unknown> = {
        amount: amountMinor,
        currency,
        localId: input.localId,
        customerReference: customerRef,
        redirectUrl: redirect,
      };
      if (webhook) payload.webhook = webhook;
      const provider = this.config.get<string>('BML_PROVIDER');
      if (provider) payload.provider = provider;
      const locale = this.config.get<string>('BML_LOCALE');
      if (locale) payload.locale = locale;

      const data = (await this.bmlRequest(
        'POST',
        '/public/v2/transactions',
        payload,
      )) as Record<string, unknown>;
      return this.normalizeTransactionResponse(data);
    }

    const apiKey = this.config.get<string>('BML_API_KEY');
    const signMethod = this.config.get<string>('BML_SIGN_METHOD') ?? 'sha1';
    const payload: Record<string, unknown> = {
      localId: input.localId,
      customerReference: customerRef,
      amount: amountMinor,
      currency,
      redirectUrl: redirect,
      appVersion: this.config.get<string>('BML_APP_VERSION') ?? 'ticketify/1.0',
      apiVersion: '2.0',
      deviceId: this.config.get<string>('BML_DEVICE_ID') ?? 'ticketify-api',
    };

    if (webhook) payload.webhook = webhook;
    const provider = this.config.get<string>('BML_PROVIDER');
    if (provider) payload.provider = provider;

    if (apiKey) {
      payload.signMethod = signMethod;
      payload.signature = this.generateV1RequestSignature(
        amountMinor,
        currency,
        apiKey,
        signMethod,
      );
    }

    const data = (await this.bmlRequest(
      'POST',
      '/public/transactions',
      payload,
    )) as Record<string, unknown>;
    const txn = this.normalizeTransactionResponse(data);

    if (txn.id && !this.pickPayUrl(txn)) {
      try {
        const fresh = await this.getPaymentTransaction(txn.id);
        return {
          ...txn,
          url: fresh.url || txn.url,
          shortUrl: fresh.shortUrl || txn.shortUrl,
          qrImageUrl: fresh.qrImageUrl || txn.qrImageUrl,
          state: fresh.state || txn.state,
        };
      } catch {
        return txn;
      }
    }

    return txn;
  }
}
