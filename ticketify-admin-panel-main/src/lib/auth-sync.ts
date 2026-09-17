// Utility to sync authentication between localStorage and cookies

export function setAuthToken(token: string) {
  // Store in localStorage (for client-side)
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', token);
  }
  
  // Store in cookie (for server-side middleware)
  document.cookie = `access_token=${token}; path=/; secure; samesite=strict; max-age=2592000`; // 30 days
}

export function removeAuthToken() {
  // Remove from localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
  }
  
  // Remove from cookies
  document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token');
  }
  return null;
}
