import { createHmac, timingSafeEqual } from 'crypto';

export function signReviewLink(
  ticketId: string,
  crmUserId: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`review:${ticketId}:${crmUserId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function verifyReviewLink(
  ticketId: string,
  crmUserId: string,
  token: string | undefined,
  secret: string,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(signReviewLink(ticketId, crmUserId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
