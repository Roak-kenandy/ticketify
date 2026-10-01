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

const PANEL_ROLES = ['Admin', 'Administrator', 'Supervisor', 'CEO'];
const DISPATCH_ROLES = ['Admin', 'Administrator', 'Supervisor'];
const REPORT_ROLES = ['Admin', 'Administrator', 'Supervisor'];
const FINANCE_REPORT_ROLES = [
  'Finance',
  'Admin',
  'Administrator',
  'Supervisor',
];

function storedRoleName(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    const raw = localStorage.getItem('user');
    if (!raw) {
      return '';
    }
    const user = JSON.parse(raw) as { role?: { name?: string } };
    return user?.role?.name ?? '';
  } catch {
    return '';
  }
}

/** Same key as ACTIVE_PREFS_KEY in ./preferences (not imported to avoid a cycle). */
const ACTIVE_PREFS_KEY = 'ticketify.prefs.active';

function storedStartPage(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    const prefs = JSON.parse(localStorage.getItem(ACTIVE_PREFS_KEY) || 'null') as {
      startPage?: string;
    } | null;
    return prefs?.startPage ?? '';
  } catch {
    return '';
  }
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

  static getRoleName(): string {
    return storedRoleName();
  }

  static isCeo(): boolean {
    return storedRoleName() === 'CEO';
  }

  static isFinance(): boolean {
    return storedRoleName() === 'Finance';
  }

  static canAccessFinanceReports(): boolean {
    return FINANCE_REPORT_ROLES.includes(storedRoleName());
  }

  static canViewOpsMap(): boolean {
    return PANEL_ROLES.includes(storedRoleName());
  }

  /** Read-only dispatch / operations board (CEO + supervisors). */
  static canViewDispatchBoard(): boolean {
    return this.canViewOpsMap();
  }

  static hasAdminRole(token: string): boolean {
    try {
      const decoded = jwtDecode<DecodedToken>(token);
      return (
        decoded.Roles &&
        decoded.Roles.some(
          (role) =>
            role.toLowerCase() === 'admin' ||
            role === 'Administrator' ||
            role === 'Supervisor' ||
            role === 'CEO',
        )
      );
    } catch {
      return false;
    }
  }

  /** Admin or Supervisor — dispatch map + auto-assign toggle (not CEO). */
  static canManageDispatch(): boolean {
    return DISPATCH_ROLES.includes(storedRoleName());
  }

  static canAccessReports(): boolean {
    return REPORT_ROLES.includes(storedRoleName());
  }

  /** User management /admin routes — not CEO. */
  static canAccessAdminPanel(): boolean {
    return DISPATCH_ROLES.includes(storedRoleName());
  }

  /** Landing page: the user's chosen start page when they can access it, else the role default. */
  static homePath(): string {
    const startPage = storedStartPage();
    if (startPage === 'operations' && this.canViewDispatchBoard()) return '/dispatch';
    if (startPage === 'finance' && this.canAccessFinanceReports()) return '/finance';
    if (startPage === 'map' && this.canViewOpsMap()) return '/';
    return this.isFinance() ? '/finance' : '/';
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
    localStorage.removeItem(ACTIVE_PREFS_KEY);
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
