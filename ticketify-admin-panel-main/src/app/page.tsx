"use client";

import { AppShell } from "@/components/shell/app-shell";
import { LiveMap } from "@/components/live-map/live-map";

export default function LiveMapPage() {
  return (
    <AppShell access="ops" fullBleed>
      <LiveMap />
    </AppShell>
  );
}
