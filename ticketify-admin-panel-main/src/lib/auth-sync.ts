/** Sync auth token between localStorage (client) and cookies (middleware). */

import { jwtDecode } from 'jwt-decode';

/** Cookie lives exactly as long as the token; fall back to one hour if `exp` is unreadable. */
function cookieMaxAge(token: string): number {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    if (typeof exp === 'number') {
      return Math.max(0, Math.floor(exp - Date.now() / 1000));
    }
  } catch {
    // fall through
  }
  return 60 * 60;
}

function cookieFlags(maxAge: number): string {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  return `path=/; samesite=strict; max-age=${maxAge}${secure ? '; secure' : ''}`;
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem('access_token', token);
  document.cookie = `access_token=${encodeURIComponent(token)}; ${cookieFlags(cookieMaxAge(token))}`;
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
