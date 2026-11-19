import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ooredoo Dashboard" };

export default function OoredooDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
