import { AdminAuth } from "./admin-auth";
import { canAny, isFullAccess, type Level, type Screen } from "./permissions";

/** Section a layout belongs to; each page is further checked against its own screen. */
export type AccessKey =
  | "any"
  | "ops"
  | "dispatch"
  | "auto-assign"
  | "status-board"
  | "reports"
  | "finance"
  | "inventory"
  | "provisioning"
  | "field"
  | "admin";

const SECTION_SCREENS: Record<Exclude<AccessKey, "any">, Screen[]> = {
  ops: ["live_map"],
  dispatch: ["operations_board"],
  "auto-assign": ["auto_assign"],
  "status-board": ["dashboard"],
  reports: ["master_report", "ticket_aging"],
  finance: ["finance_overview", "payments"],
  inventory: ["inventory_consumption", "stock", "stock_report", "item_master"],
  provisioning: ["provisioning_log"],
  field: ["technician_app"],
  admin: ["team_overview", "users", "master_report"],
};

export function hasAccess(key: AccessKey): boolean {
  return key === "any" || canAny(SECTION_SCREENS[key]);
}

/** A page's own requirement: a screen at a level, or full access (role management). */
export type RouteRule = { href: string; exact?: boolean; screen: Screen | "full"; level?: Level };

export function meetsRule(rule: Pick<RouteRule, "screen" | "level">): boolean {
  return rule.screen === "full" ? isFullAccess() : canAny([rule.screen], rule.level);
}

/** The most specific rule for a path wins; paths without a rule fall back to their section. */
export function routeAllowed(pathname: string, rules: RouteRule[]): boolean {
  const matches = rules.filter((rule) =>
    rule.exact ? pathname === rule.href : pathname === rule.href || pathname.startsWith(`${rule.href}/`),
  );
  if (!matches.length) return true;
  const best = matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
  return meetsRule(best);
}

export type SessionUser = {
  name: string;
  email: string;
  role: string;
};

export function readSessionUser(): SessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem("user");
    if (!raw) {
      return null;
    }
    const user = JSON.parse(raw) as { name?: string; email?: string };
    return {
      name: user.name ?? "",
      email: user.email ?? "",
      role: AdminAuth.getRoleName(),
    };
  } catch {
    return null;
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
    .toUpperCase();
}
