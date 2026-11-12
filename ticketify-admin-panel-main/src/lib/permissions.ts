import { jwtDecode } from "jwt-decode";
import { getAuthToken } from "./auth-sync";

/** Ordered from least to most access; each level includes the ones below it. */
export const LEVELS = ["VIEW", "EDIT", "DELETE"] as const;
export type Level = (typeof LEVELS)[number];

/** Screen keys from the API catalogue (GET /roles/screens). */
export type Screen =
  | "live_map"
  | "dashboard"
  | "operations_board"
  | "auto_assign"
  | "technician_app"
  | "master_report"
  | "ticket_aging"
  | "finance_overview"
  | "payments"
  | "inventory_consumption"
  | "stock"
  | "stock_report"
  | "item_master"
  | "provisioning_log"
  | "team_overview"
  | "users";

export type Capability = "field_technician" | "stock_holder" | "store";

export type UserAccess = {
  full: boolean;
  field_technician: boolean;
  stock_holder: boolean;
  store: boolean;
  permissions: Partial<Record<Screen, Level>>;
};

const STORAGE_KEY = "ticketify.access";

function tokenSubject(): string | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    return jwtDecode<{ sub?: string }>(token).sub ?? null;
  } catch {
    return null;
  }
}

/** Kept per user so a stale entry from another account is never used. */
export function storeAccess(access: UserAccess): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sub: tokenSubject(), access }));
}

export function clearAccess(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Access of the signed-in user as last reported by the API. Only drives what
 * the console shows; the API checks every request itself.
 */
export function readAccess(): UserAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as {
      sub?: string | null;
      access?: UserAccess;
    } | null;
    const sub = tokenSubject();
    return stored?.access && sub && stored.sub === sub ? stored.access : null;
  } catch {
    return null;
  }
}

export function levelRank(level: string | null | undefined): number {
  return level ? LEVELS.indexOf(level as Level) + 1 : 0;
}

export function canWith(
  access: UserAccess | null | undefined,
  screen: Screen,
  level: Level = "VIEW",
): boolean {
  if (!access) return false;
  if (access.full) return true;
  return levelRank(access.permissions[screen]) >= levelRank(level);
}

export function can(screen: Screen, level: Level = "VIEW"): boolean {
  return canWith(readAccess(), screen, level);
}

export function canAny(screens: Screen[], level: Level = "VIEW"): boolean {
  const access = readAccess();
  return screens.some((screen) => canWith(access, screen, level));
}

export function hasCapability(capability: Capability): boolean {
  return Boolean(readAccess()?.[capability]);
}

export function isFullAccess(): boolean {
  return Boolean(readAccess()?.full);
}

/** Any screen besides the technician app. */
export function hasConsoleAccessWith(access: UserAccess | null | undefined): boolean {
  if (!access) return false;
  if (access.full) return true;
  return Object.keys(access.permissions).some((key) => key !== "technician_app");
}

export function canSignInWith(access: UserAccess | null | undefined): boolean {
  return Boolean(access && (access.full || Object.keys(access.permissions).length));
}

export type AccessRefresh =
  | { status: "ok"; access: UserAccess; changed: boolean }
  | { status: "signed-out" }
  | { status: "offline" };

/** Fetches the current access so role changes show without signing in again. */
export async function refreshAccess(): Promise<AccessRefresh> {
  const token = getAuthToken();
  if (!token) return { status: "signed-out" };
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api/v1";
  try {
    const response = await fetch(`${apiBase}/users/me/access`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.status === 401) return { status: "signed-out" };
    if (!response.ok) return { status: "offline" };
    const access = (await response.json()) as UserAccess;
    const changed = JSON.stringify(access) !== JSON.stringify(readAccess());
    if (changed) storeAccess(access);
    return { status: "ok", access, changed };
  } catch {
    return { status: "offline" };
  }
}
