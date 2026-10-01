import { AdminAuth } from "./admin-auth";

export type AccessKey =
  | "any"
  | "ops"
  | "dispatch"
  | "reports"
  | "finance"
  | "admin";

export function hasAccess(key: AccessKey): boolean {
  switch (key) {
    case "ops":
      return AdminAuth.canViewOpsMap();
    case "dispatch":
      return AdminAuth.canViewDispatchBoard();
    case "reports":
      return AdminAuth.canAccessReports();
    case "finance":
      return AdminAuth.canAccessFinanceReports();
    case "admin":
      return AdminAuth.canAccessAdminPanel();
    default:
      return true;
  }
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
    const user = JSON.parse(raw) as {
      name?: string;
      email?: string;
      role?: { name?: string };
    };
    return {
      name: user.name ?? "",
      email: user.email ?? "",
      role: user.role?.name ?? "",
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
