import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ticketify - Dashboard",
  description: "Remote support ticketing system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={
          "grid h-screen w-screen overflow-hidden grid-cols-1 gap-2  " +
          inter.className
        }
      >
        <main className="w-full h-full">{children}</main>
      </body>
    </html>
  );
}
