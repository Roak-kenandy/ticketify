import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Ticket aging" };

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell access="reports">{children}</AppShell>;
}
