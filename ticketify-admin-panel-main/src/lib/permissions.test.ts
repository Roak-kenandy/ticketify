import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasAccess, routeAllowed, type RouteRule } from "./access";
import {
  can,
  canSignInWith,
  canWith,
  hasConsoleAccessWith,
  readAccess,
  storeAccess,
  type UserAccess,
} from "./permissions";

const finance: UserAccess = {
  full: false,
  field_technician: false,
  stock_holder: false,
  store: false,
  permissions: { finance_overview: "EDIT", payments: "VIEW" },
};
const technician: UserAccess = {
  full: false,
  field_technician: true,
  stock_holder: false,
  store: false,
  permissions: { technician_app: "VIEW" },
};
const admin: UserAccess = { ...finance, full: true, store: true, permissions: {} };

function token(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode({ sub, exp: Date.now() / 1000 + 3600 })}.sig`;
}

function signIn(sub: string, access: UserAccess) {
  localStorage.setItem("access_token", token(sub));
  storeAccess(access);
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("permissions", () => {
  it("compares levels, with full access passing everything", () => {
    expect(canWith(finance, "finance_overview", "VIEW")).toBe(true);
    expect(canWith(finance, "payments", "EDIT")).toBe(false);
    expect(canWith(finance, "live_map")).toBe(false);
    expect(canWith(admin, "users", "DELETE")).toBe(true);
  });

  it("separates console users from technician-app-only users", () => {
    expect(hasConsoleAccessWith(finance)).toBe(true);
    expect(hasConsoleAccessWith(technician)).toBe(false);
    expect(canSignInWith(technician)).toBe(true);
    expect(canSignInWith({ ...finance, permissions: {} })).toBe(false);
  });

  it("ignores stored access that belongs to another account", () => {
    signIn("user-1", finance);
    expect(readAccess()).toEqual(finance);
    localStorage.setItem("access_token", token("user-2"));
    expect(readAccess()).toBeNull();
    expect(can("finance_overview")).toBe(false);
  });
});

describe("route access", () => {
  const rules: RouteRule[] = [
    { href: "/", exact: true, screen: "live_map" },
    { href: "/finance", exact: true, screen: "finance_overview" },
    { href: "/finance/reports", screen: "payments" },
    { href: "/admin/users", screen: "users" },
    { href: "/admin/users/create", screen: "users", level: "EDIT" },
    { href: "/admin/roles", screen: "full" },
  ];

  it("uses the most specific rule for a path", () => {
    signIn("u", { ...finance, permissions: { ...finance.permissions, users: "VIEW" } });
    expect(routeAllowed("/finance", rules)).toBe(true);
    expect(routeAllowed("/finance/reports/x", rules)).toBe(true);
    expect(routeAllowed("/", rules)).toBe(false);
    expect(routeAllowed("/admin/users/abc", rules)).toBe(true);
    expect(routeAllowed("/admin/users/create", rules)).toBe(false);
    expect(routeAllowed("/admin/roles", rules)).toBe(false);
    expect(routeAllowed("/settings", rules)).toBe(true);
  });

  it("opens role management to full access only", () => {
    signIn("a", admin);
    expect(routeAllowed("/admin/roles", rules)).toBe(true);
    expect(hasAccess("inventory")).toBe(true);
  });

  it("maps layout sections to their screens", () => {
    signIn("t", technician);
    expect(hasAccess("field")).toBe(true);
    expect(hasAccess("finance")).toBe(false);
    expect(hasAccess("any")).toBe(true);
  });
});
