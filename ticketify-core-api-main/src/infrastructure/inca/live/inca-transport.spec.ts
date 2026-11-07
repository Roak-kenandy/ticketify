import { IncaRejectedError, IncaUnavailableError } from '../inca.types';
import { IncaSender, IncaTransport, IncaWireRequest } from './inca-transport';

const CONFIG = {
  baseUrl: 'https://inca.test/api',
  username: 'ticketify',
  password: 'pw-secret',
  caPem: '',
  fingerprint256: 'AA',
  timeoutMs: 1000,
  maxConcurrent: 2,
};

function token(n: number, expSeconds: number) {
  const payload = Buffer.from(
    JSON.stringify({ sub: '72', exp: expSeconds }),
  ).toString('base64url');
  return `eyJhbGciOiJIUzUxMiJ9.${payload}.sig${n}`;
}

const silent = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

function setup(
  handler: (
    req: IncaWireRequest,
    logins: number,
  ) => { status: number; body: unknown },
) {
  let now = 1_000_000_000_000;
  let logins = 0;
  const calls: IncaWireRequest[] = [];
  const send: IncaSender = async (req) => {
    calls.push(req);
    if (req.url.pathname.endsWith('/inca-users/login')) {
      logins += 1;
    }
    const { status, body } = handler(req, logins);
    return {
      status,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };
  };
  const transport = new IncaTransport(CONFIG, send, silent, () => now);
  return {
    transport,
    calls,
    logins: () => logins,
    advance: (ms: number) => (now += ms),
    nowSeconds: () => Math.floor(now / 1000),
  };
}

const loginOk = (n: number, exp: number) => ({
  status: 200,
  body: { token: { id: token(n, exp) }, user: { id: 72 } },
});

describe('IncaTransport', () => {
  it('signs in once for concurrent requests and sends the token only as a header', async () => {
    const env = setup((req, logins) =>
      req.url.pathname.endsWith('/login')
        ? loginOk(logins, 2_000_000_000)
        : { status: 200, body: [] },
    );
    await Promise.all([
      env.transport.get('/fttx/a', { where: { x: 1 } }),
      env.transport.get('/fttx/b'),
    ]);
    expect(env.logins()).toBe(1);
    const data = env.calls.filter((c) => !c.url.pathname.endsWith('/login'));
    for (const call of data) {
      expect(call.headers['X-Access-Token']).toBe(token(1, 2_000_000_000));
      expect(call.url.href).not.toContain('eyJ');
    }
    expect(data[0].url.searchParams.get('filter')).toBe('{"where":{"x":1}}');
  });

  it('renews the token before it expires', async () => {
    let exp = 0;
    const env = setup((req, logins) =>
      req.url.pathname.endsWith('/login')
        ? loginOk(logins, exp)
        : { status: 200, body: {} },
    );
    exp = env.nowSeconds() + 24 * 3600;
    await env.transport.get('/x');
    env.advance(23 * 3600 * 1000);
    await env.transport.get('/x');
    expect(env.logins()).toBe(1);
    env.advance(55 * 60 * 1000);
    exp = env.nowSeconds() + 24 * 3600;
    await env.transport.get('/x');
    expect(env.logins()).toBe(2);
  });

  it('signs in again and replays once when INCA answers 401', async () => {
    let rejected = false;
    const env = setup((req, logins) => {
      if (req.url.pathname.endsWith('/login'))
        return loginOk(logins, 2_000_000_000);
      if (!rejected) {
        rejected = true;
        return { status: 401, body: { message: 'expired' } };
      }
      return { status: 201, body: { id: 1 } };
    });
    await expect(
      env.transport.post('/fttx/optical-devices', { a: 1 }),
    ).resolves.toEqual({ id: 1 });
    expect(env.logins()).toBe(2);
  });

  it('cools down after a refused login instead of retrying the password', async () => {
    const env = setup(() => ({
      status: 401,
      body: { message: 'bad credentials' },
    }));
    await expect(env.transport.get('/x')).rejects.toBeInstanceOf(
      IncaUnavailableError,
    );
    await expect(env.transport.get('/x')).rejects.toThrow(/cooling down/);
    expect(env.logins()).toBe(1);
    env.advance(61_000);
    await expect(env.transport.get('/x')).rejects.toBeInstanceOf(
      IncaUnavailableError,
    );
    expect(env.logins()).toBe(2);
  });

  it("maps 4xx to a rejection with INCA's reason and 5xx to unavailable", async () => {
    let status = 409;
    const env = setup((req, logins) =>
      req.url.pathname.endsWith('/login')
        ? loginOk(logins, 2_000_000_000)
        : { status, body: { message: 'Serial number already exists' } },
    );
    await expect(
      env.transport.post('/fttx/optical-devices', {}),
    ).rejects.toEqual(new IncaRejectedError('Serial number already exists'));
    status = 502;
    await expect(env.transport.get('/x')).rejects.toBeInstanceOf(
      IncaUnavailableError,
    );
  });

  it('never puts credentials or tokens into errors or logs', async () => {
    const env = setup((req, logins) =>
      req.url.pathname.endsWith('/login')
        ? loginOk(logins, 2_000_000_000)
        : { status: 400, body: { message: `bad ${token(9, 1)}` } },
    );
    const error = await env.transport.get('/x').catch((e: Error) => e);
    const logged = JSON.stringify([
      silent.log.mock.calls,
      silent.warn.mock.calls,
      silent.error.mock.calls,
    ]);
    for (const text of [String(error), logged]) {
      expect(text).not.toContain('pw-secret');
      expect(text).not.toContain('eyJ');
    }
  });

  it('refuses unsafe paths and plain http', async () => {
    const env = setup(() => ({ status: 200, body: {} }));
    await expect(env.transport.get('/../admin')).rejects.toThrow(/unsafe/);
    await expect(env.transport.get('/x?y=1')).rejects.toThrow(/unsafe/);
    expect(env.calls).toHaveLength(0);
    expect(
      () =>
        new IncaTransport(
          { ...CONFIG, baseUrl: 'http://inca.test/api' },
          jest.fn(),
          silent,
        ),
    ).toThrow(/https/);
  });
});
