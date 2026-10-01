import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { PreferencesProvider } from "@/components/preferences-provider";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ticketify · Medianet Operations",
    template: "%s · Ticketify",
  },
  description: "Field operations, dispatch and reporting for Medianet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b111c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background font-sans">
        <ThemeProvider>
          <PreferencesProvider>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </PreferencesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
