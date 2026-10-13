"use client";

import {
  KeyRound,
  Layers,
  LayoutGrid,
  Loader2,
  LogOut,
  MapPin,
  MonitorPlay,
  Phone,
  Star,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { ConfirmDialog } from "@/components/field/ui/confirm-dialog";
import { Overlay } from "@/components/field/ui/overlay";
import { AdminAuth } from "@/lib/admin-auth";
import { SUPPORT_PHONE } from "@/lib/field/app";
import { cn } from "@/lib/field/cn";
import { useSession } from "@/lib/field/session";
import { initials } from "@/lib/field/ticket-meta";

const NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/field", label: "Dashboard", icon: LayoutGrid },
  { href: "/field/tickets", label: "My tickets", icon: Layers },
  { href: "/field/reviews", label: "Reviews", icon: Star },
  { href: "/field/account", label: "Account", icon: UserCircle },
  { href: "/field/tracking", label: "Location tracking", icon: MapPin },
];

type DrawerValue = { open: () => void; confirmSignOut: () => void };
const DrawerContext = React.createContext<DrawerValue>({ open: () => {}, confirmSignOut: () => {} });

export const useDrawer = () => React.useContext(DrawerContext);

function isActive(pathname: string, href: string) {
  if (href === "/field") {
    return pathname === "/field";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DrawerContent({
  onNavigate,
  onSignOut,
  signingOut,
}: {
  onNavigate: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const { user } = useSession();
  const pathname = usePathname();
  const consoleHref = AdminAuth.canUseConsole() ? AdminAuth.consoleHomePath() : null;
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto pb-3 pt-4">
        <div className="mx-4 mb-4 rounded-lg bg-primary p-4">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-lg font-bold text-primary">
            {initials(user?.name)}
          </div>
          <p className="text-lg font-bold text-white">{user?.name ?? "Technician"}</p>
          <p className="mt-1 truncate text-[13px] text-white/80">{user?.email ?? ""}</p>
        </div>
        <nav className="flex flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => {
            const focused = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-3.5",
                  focused ? "bg-tertiary text-primary" : "text-gray2 hover:bg-surface",
                )}
              >
                <Icon className="h-[22px] w-7" />
                <span className="text-base font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-col gap-1 border-t border-borderlight p-4">
        {consoleHref ? (
          <Link
            href={consoleHref}
            onClick={onNavigate}
            className="flex items-center gap-3 px-2 py-3 text-[15px] font-medium text-ink"
          >
            <MonitorPlay className="h-5 w-7 text-gray2" />
            Operations console
          </Link>
        ) : null}
        <Link
          href="/field/account/password"
          onClick={onNavigate}
          className="flex items-center gap-3 px-2 py-3 text-[15px] font-medium text-ink"
        >
          <KeyRound className="h-5 w-7 text-gray2" />
          Change password
        </Link>
        <a href={`tel:${SUPPORT_PHONE}`} className="flex items-center gap-3 px-2 py-3 text-[15px] font-medium text-ink">
          <Phone className="h-5 w-7 text-gray2" />
          Contact support
        </a>
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex items-center gap-3 px-2 py-3 text-left text-[15px] font-medium text-error"
        >
          {signingOut ? <Loader2 className="h-5 w-7 animate-spin" /> : <LogOut className="h-5 w-7" />}
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

/** Drawer navigation: slide-out on phones, fixed sidebar on wide screens. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { signOut } = useSession();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const value = React.useMemo(
    () => ({ open: () => setDrawerOpen(true), confirmSignOut: () => setConfirming(true) }),
    [],
  );

  const startSignOut = () => {
    setDrawerOpen(false);
    setConfirming(true);
  };

  return (
    <DrawerContext.Provider value={value}>
      <div className="min-h-[100dvh] bg-surface lg:pl-72">
        <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-borderlight lg:block">
          <DrawerContent onNavigate={() => {}} onSignOut={startSignOut} signingOut={signingOut} />
        </aside>
        {children}
      </div>

      <Overlay open={drawerOpen} onEscape={() => setDrawerOpen(false)}>
        <div
          className="fixed inset-0 z-50 animate-fade-in bg-[rgba(15,23,42,0.55)] lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDrawerOpen(false);
            }
          }}
        >
          <div className="h-full w-[82%] max-w-xs animate-slide-in shadow-sheet">
            <DrawerContent
              onNavigate={() => setDrawerOpen(false)}
              onSignOut={startSignOut}
              signingOut={signingOut}
            />
          </div>
        </div>
      </Overlay>

      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        message="You'll be marked offline and stop receiving job notifications on this device."
        confirmText="Sign out"
        destructive
        loading={signingOut}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
            setConfirming(false);
          }
        }}
      />
    </DrawerContext.Provider>
  );
}
