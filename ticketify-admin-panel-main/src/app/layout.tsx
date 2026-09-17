import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import StatBoard from "@/components/statistics-board/stat-board";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ticketify - Dashboard",
  description: "Remote support ticketing system",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body
        className={
          "h-screen w-screen overflow-hidden bg-background " +
          inter.className
        }
        style={{ touchAction: "pan-x pan-y" }}
      >
        <main className="w-full h-full">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
