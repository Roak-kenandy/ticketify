import type { Metadata, Viewport } from "next";
import { FieldGate } from "@/components/field/shell/field-gate";

export const metadata: Metadata = {
  title: { default: "Field", template: "%s · Ticketify Field" },
  description: "Field tasks and tickets for Medianet technicians",
  manifest: "/field.webmanifest",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  appleWebApp: { capable: true, title: "Ticketify", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#010D51",
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldGate>{children}</FieldGate>;
}
