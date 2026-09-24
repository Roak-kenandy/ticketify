/** Sync auth token between localStorage (client) and cookies (middleware). */

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function cookieFlags(): string {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  return `path=/; samesite=strict; max-age=${COOKIE_MAX_AGE}${
    secure ? '; secure' : ''
  }`;
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem('access_token', token);
  document.cookie = `access_token=${encodeURIComponent(token)}; ${cookieFlags()}`;
}

export function removeAuthToken() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('access_token');
  document.cookie =
    'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=strict';
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('access_token');
}
