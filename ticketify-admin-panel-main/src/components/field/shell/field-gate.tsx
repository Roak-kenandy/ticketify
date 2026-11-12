"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import React from "react";
import { AdminAuth } from "@/lib/admin-auth";
import { readAccess, refreshAccess } from "@/lib/permissions";
import { AppShell } from "@/components/field/shell/app-shell";
import { ActivityBar } from "@/components/field/shell/activity-bar";
import { LOGIN_PATH, SessionProvider, useSession } from "@/lib/field/session";
import { TicketsProvider } from "@/lib/field/tickets";

function Splash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-primary">
      <Image src="/logo.png" alt="mPro" width={88} height={88} priority className="animate-pulse-soft" />
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { ready, token } = useSession();
  const router = useRouter();
  const [accessReady, setAccessReady] = React.useState(false);
  const allowed = ready && accessReady && Boolean(token) && AdminAuth.canUseFieldApp();

  React.useEffect(() => {
    if (!ready || !token) {
      return;
    }
    let cancelled = false;
    if (readAccess()) setAccessReady(true);
    refreshAccess().then((result) => {
      if (cancelled) return;
      if (result.status === "signed-out" || (result.status === "offline" && !readAccess())) {
        AdminAuth.clearSession();
        router.replace(LOGIN_PATH);
        return;
      }
      setAccessReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, token, router]);

  React.useEffect(() => {
    if (!ready) {
      return;
    }
    if (!token) {
      router.replace(LOGIN_PATH);
    } else if (accessReady && !AdminAuth.canUseFieldApp()) {
      router.replace(AdminAuth.homePath());
    }
  }, [ready, token, accessReady, router]);

  if (!allowed) {
    return <Splash />;
  }

  return (
    <TicketsProvider>
      <AppShell>{children}</AppShell>
    </TicketsProvider>
  );
}

/** Technician workspace: keeps its own light palette even when the console is in dark mode. */
export function FieldGate({ children }: { children: React.ReactNode }) {
  return (
    <div className="field-app min-h-[100dvh] bg-surface text-ink">
      <SessionProvider>
        <ActivityBar />
        <Gate>{children}</Gate>
      </SessionProvider>
    </div>
  );
}
