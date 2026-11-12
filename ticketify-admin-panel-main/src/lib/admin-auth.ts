import { jwtDecode } from 'jwt-decode';
import { getAuthToken, removeAuthToken, setAuthToken } from './auth-sync';
import {
  can,
  canSignInWith,
  clearAccess,
  hasCapability,
  hasConsoleAccessWith,
  readAccess,
  type Screen,
  type UserAccess,
} from './permissions';

interface DecodedToken {
  sub: string;
  email: string;
  crm_user_id: string;
  Roles: string[];
  iat: number;
  exp: number;
}

/** Where each screen lives, in the order a default landing page is picked. */
const LANDING: [Screen, string][] = [
  ["live_map", "/"],
  ["dashboard", "/dashboard"],
  ["operations_board", "/dispatch"],
  ["finance_overview", "/finance"],
  ["payments", "/finance/reports"],
  ["inventory_consumption", "/inventory"],
  ["stock", "/inventory/stock"],
  ["stock_report", "/inventory/stock/report"],
  ["item_master", "/inventory/items"],
  ["master_report", "/admin/reports"],
  ["ticket_aging", "/reports"],
  ["auto_assign", "/auto-assign"],
  ["provisioning_log", "/provisioning"],
  ["team_overview", "/admin"],
  ["users", "/admin/users"],
];

/**
 * Role name from the signed access token, for display only. What the user
 * may open comes from their stored access (see ./permissions).
 */
function storedRoleName(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const token = getAuthToken();
  if (!token) {
    return '';
  }
  try {
    const { Roles, exp } = jwtDecode<DecodedToken>(token);
    if (typeof exp !== 'number' || exp * 1000 <= Date.now()) {
      return '';
    }
    return Array.isArray(Roles) && typeof Roles[0] === 'string' ? Roles[0] : '';
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
      return typeof decoded.exp === 'number' && decoded.exp > currentTime;
    } catch {
      return false;
    }
  }

  /** Milliseconds until the token expires (0 if already expired or unreadable). */
  static msUntilExpiry(token: string): number {
    try {
      const { exp } = jwtDecode<DecodedToken>(token);
      return typeof exp === 'number' ? Math.max(0, exp * 1000 - Date.now()) : 0;
    } catch {
      return 0;
    }
  }

  static getRoleName(): string {
    return storedRoleName();
  }

  /** Finance overview or the payments report. */
  static canAccessFinanceReports(): boolean {
    return can("finance_overview") || can("payments");
  }

  /** The store: issue stock to holders and record returns. */
  static canManageStore(): boolean {
    return hasCapability("store") && can("stock", "EDIT");
  }

  /** Holds stock from the store and hands it out to technicians. */
  static isStockHolder(): boolean {
    return hasCapability("stock_holder") && can("stock", "EDIT");
  }

  /** Request alerts go to the store and to stock holders. */
  static canSeeStockAlerts(): boolean {
    return (hasCapability("store") || hasCapability("stock_holder")) && can("stock");
  }

  /** Create and edit items, UOMs and serial/decimal rules. */
  static canManageItemMaster(): boolean {
    return can("item_master", "EDIT");
  }

  static canSignIn(access: UserAccess | null | undefined): boolean {
    return canSignInWith(access);
  }

  /** Technician workspace under /field. */
  static canUseFieldApp(): boolean {
    return can("technician_app");
  }

  static canUseConsole(): boolean {
    return hasConsoleAccessWith(readAccess());
  }

  /** Landing page: technician-app-only users go to /field, everyone else to their console home. */
  static homePath(): string {
    if (!this.canUseConsole()) {
      return this.canUseFieldApp() ? '/field' : '/auth/login';
    }
    return this.consoleHomePath();
  }

  /** The user's chosen start page when they can open it, else their first screen. */
  static consoleHomePath(): string {
    const startPage = storedStartPage();
    if (startPage === 'operations' && can('operations_board')) return '/dispatch';
    if (startPage === 'finance' && can('finance_overview')) return '/finance';
    if (startPage === 'inventory' && can('inventory_consumption')) return '/inventory';
    if (startPage === 'map' && can('live_map')) return '/';
    return LANDING.find(([screen]) => can(screen))?.[1] ?? '/settings';
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
    clearAccess();
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem(ACTIVE_PREFS_KEY);
  }

  /** Full logout — clears storage + cookies and redirects to login */
  static logout(): void {
    const token = this.getToken();
    if (token && typeof window !== 'undefined') {
      // Revoke server-side so a copied token stops working immediately.
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';
      fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => undefined);
    }
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
