"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import { usePreferences } from "@/components/preferences-provider";
import type { ThemePreference } from "@/lib/preferences";
import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminAuth } from "@/lib/admin-auth";
import {
  hasAccess,
  initials,
  readSessionUser,
  type AccessKey,
  type SessionUser,
} from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLockup, BrandMark } from "./brand";
import { NAV_GROUPS, isNavItemActive } from "./nav-config";

type AppShellProps = {
  access?: AccessKey;
  /** Edge-to-edge content (map) — no padding, no page scroll. */
  fullBleed?: boolean;
  children: React.ReactNode;
};

export function AppShell({ access = "any", fullBleed, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [allowed, setAllowed] = React.useState(false);
  const { preferences, update } = usePreferences();
  const collapsed = preferences.sidebarCollapsed;
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const token = AdminAuth.getToken();
    if (!token || !AdminAuth.isTokenValid(token)) {
      AdminAuth.clearSession();
      router.replace("/auth/login");
      return;
    }
    if (!hasAccess(access)) {
      const home = AdminAuth.homePath();
      router.replace(home === pathname ? "/auth/login" : home);
      return;
    }
    setUser(readSessionUser());
    setAllowed(true);
  }, [access, pathname, router]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    update({ sidebarCollapsed: !collapsed });
  }

  if (!allowed) {
    return <ShellSkeleton />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-elevated"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <SidebarContent
          pathname={pathname}
          user={user}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar shadow-elevated data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
            <SidebarContent pathname={pathname} user={user} collapsed={false} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/80 px-3 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <BrandLockup />
          <ThemeQuickToggle className="ml-auto" />
        </header>

        <main
          id="main"
          className={cn(
            "min-h-0 flex-1",
            fullBleed ? "relative overflow-hidden" : "scrollbar-thin overflow-y-auto",
          )}
        >
          {fullBleed ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  user,
  collapsed,
  onToggleCollapsed,
}: {
  pathname: string;
  user: SessionUser | null;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAccess(item.access)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <Link
          href={AdminAuth.homePath()}
          className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Ticketify home"
        >
          {collapsed ? <BrandMark /> : <BrandLockup />}
        </Link>
      </div>

      <nav
        aria-label="Main"
        className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4"
      >
        {groups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border first:hidden" />
            ) : (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-md text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -left-3 top-1.5 h-6 w-1 rounded-r-full bg-primary"
                        />
                      )}
                      <item.icon
                        className={cn(
                          "h-[18px] w-[18px]",
                          active ? "text-sidebar-accent-foreground" : "text-sidebar-muted group-hover:text-sidebar-foreground",
                        )}
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
        <UserMenu user={user} collapsed={collapsed} />
        <div className={cn("flex gap-1", collapsed && "flex-col")}>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-8 flex-1 items-center gap-2 rounded-md text-xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed ? "justify-center" : "px-2.5",
            )}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                Collapse
              </>
            )}
          </button>
        )}
        <ThemeQuickToggle
          className={cn(
            "h-8 text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            collapsed ? "w-full" : "w-8",
          )}
        />
        </div>
      </div>
    </div>
  );
}

function ThemeQuickToggle({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const { update } = usePreferences();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => update({ theme: isDark ? "light" : "dark" })}
      aria-label={label}
      title={label}
      className={className}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function UserMenu({
  user,
  collapsed,
}: {
  user: SessionUser | null;
  collapsed: boolean;
}) {
  const { preferences, update } = usePreferences();
  const name = user?.name || user?.email || "Signed in";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-sidebar-accent/60",
            collapsed && "justify-center",
          )}
          aria-label="Account menu"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(name)}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {name}
              </span>
              <span className="block truncate text-xs text-sidebar-muted">
                {user?.role || "—"}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          {user?.email && (
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preferences.theme}
          onValueChange={(value) => update({ theme: value as ThemePreference })}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 h-4 w-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 h-4 w-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 h-4 w-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => AdminAuth.logout()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background" aria-busy="true">
      <div className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 lg:flex">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 space-y-6 p-8">
        <Skeleton className="h-7 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
