import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Operations board" };

export default function DispatchLayout({ children }: { children: React.ReactNode }) {
  return <AppShell access="dispatch">{children}</AppShell>;
}
