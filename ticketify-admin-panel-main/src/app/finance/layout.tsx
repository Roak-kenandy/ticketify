import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Finance" };

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell access="finance">{children}</AppShell>;
}
