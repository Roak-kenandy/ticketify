import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell access="inventory">{children}</AppShell>;
}
