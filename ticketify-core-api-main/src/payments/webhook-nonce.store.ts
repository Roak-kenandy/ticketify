const NONCE_TTL_MS = 10 * 60 * 1000;
const seenNonces = new Map<string, number>();

function pruneExpired(now = Date.now()) {
  for (const [nonce, expiresAt] of seenNonces) {
    if (expiresAt <= now) {
      seenNonces.delete(nonce);
    }
  }
}

export function consumeWebhookNonce(nonce: string): boolean {
  if (!nonce || typeof nonce !== 'string') return false;

  pruneExpired();

  if (seenNonces.has(nonce)) {
    return false;
  }

  seenNonces.set(nonce, Date.now() + NONCE_TTL_MS);
  return true;
}
