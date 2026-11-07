const PRODUCTION_ALIASES = new Set(['production', 'prod', 'live']);

export function normalizeNodeEnv(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return 'development';
  return PRODUCTION_ALIASES.has(raw) ? 'production' : raw;
}

/**
 * Runs once at boot via ConfigModule. Normalizes NODE_ENV (deployments used
 * "prod", which silently disabled every `=== 'production'` safety check) and
 * refuses to start production with weak or missing secrets.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = normalizeNodeEnv(config.NODE_ENV ?? process.env.NODE_ENV);
  process.env.NODE_ENV = nodeEnv;
  const result = { ...config, NODE_ENV: nodeEnv };

  const problems: string[] = [];
  const jwtSecret = String(config.JWT_SECRET ?? '');
  if (!jwtSecret) {
    problems.push('JWT_SECRET is required');
  } else if (nodeEnv === 'production' && jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters in production');
  }

  if (nodeEnv === 'production') {
    if (!String(config.CORS_ORIGINS ?? '').trim()) {
      problems.push('CORS_ORIGINS is required in production');
    }
    if (!String(config.FEEDBACK_LINK_SECRET ?? '').trim()) {
      problems.push('FEEDBACK_LINK_SECRET is required in production');
    }
  }

  const incaMode = String(config.INCA_MODE ?? 'dummy')
    .trim()
    .toLowerCase();
  if (incaMode === 'live') {
    const value = (key: string) => String(config[key] ?? '').trim();
    if (!/^https:\/\/[^\s/]+/i.test(value('INCA_BASE_URL'))) {
      problems.push(
        'INCA_BASE_URL must be an https:// URL when INCA_MODE=live',
      );
    }
    if (!value('INCA_USERNAME') || !String(config.INCA_PASSWORD ?? '')) {
      problems.push(
        'INCA_USERNAME and INCA_PASSWORD are required when INCA_MODE=live',
      );
    }
    if (!value('INCA_TLS_CA_FILE')) {
      problems.push('INCA_TLS_CA_FILE is required when INCA_MODE=live');
    }
    if (
      value('INCA_TLS_FINGERPRINT').replace(/[^0-9a-f]/gi, '').length !== 64
    ) {
      problems.push(
        'INCA_TLS_FINGERPRINT must be the SHA-256 fingerprint of the INCA certificate',
      );
    }
  }

  if (problems.length) {
    throw new Error(
      `Invalid environment configuration: ${problems.join('; ')}`,
    );
  }
  return result;
}
