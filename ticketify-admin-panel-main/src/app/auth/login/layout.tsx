import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ticketify - Login",
  description: "Sign in to Ticketify",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
