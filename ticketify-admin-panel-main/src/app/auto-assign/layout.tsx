import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Auto-assign" };

export default function AutoAssignLayout({ children }: { children: React.ReactNode }) {
  return <AppShell access="dispatch-manage">{children}</AppShell>;
}
