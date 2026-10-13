import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Provisioning log" };

export default function ProvisioningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell access="provisioning">{children}</AppShell>;
}
