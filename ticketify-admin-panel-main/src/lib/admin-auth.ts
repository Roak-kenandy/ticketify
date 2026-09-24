import { jwtDecode } from 'jwt-decode';
import { getAuthToken, removeAuthToken, setAuthToken } from './auth-sync';

interface DecodedToken {
  sub: string;
  email: string;
  crm_user_id: string;
  Roles: string[];
  iat: number;
  exp: number;
}

export class AdminAuth {
  static getToken(): string | null {
    return getAuthToken();
  }

  static setToken(token: string): void {
    setAuthToken(token);
  }

  static isTokenValid(token: string): boolean {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      const currentTime = Date.now() / 1000;
      return decoded.exp > currentTime;
    } catch {
      return false;
    }
  }

  static hasAdminRole(token: string): boolean {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      return (
        decoded.Roles &&
        decoded.Roles.some(
          (role) =>
            role.toLowerCase() === 'admin' || role === 'Administrator',
        )
      );
    } catch {
      return false;
    }
  }

  static isUserAuthorized(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }
    if (!this.isTokenValid(token)) {
      return false;
    }
    return this.hasAdminRole(token);
  }

  static getUserInfo(): DecodedToken | null {
    const token = this.getToken();
    if (!token || !this.isTokenValid(token)) {
      return null;
    }

    try {
      return jwtDecode<DecodedToken>(token);
    } catch {
      return null;
    }
  }

  /** Clear all session data without redirect */
  static clearSession(): void {
    if (typeof window === 'undefined') {
      return;
    }
    removeAuthToken();
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  }

  /** Full logout — clears storage + cookies and redirects to login */
  static logout(): void {
    this.clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }

  static getAuthHeaders(): { [key: string]: string } {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }
}
