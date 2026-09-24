"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminAuth } from "@/lib/admin-auth";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [userEmail, setUserEmail] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const user = JSON.parse(raw);
        setUserEmail(user?.email ?? "");
      }
    } catch {
      setUserEmail("");
    }
  }, []);

  if (!AdminAuth.getToken()) {
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to tracker
          </Link>
          <ThemeToggle />
        </div>

        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Appearance and account preferences
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="text-sm text-muted-foreground">
            Choose light, dark, or match your system setting.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["light", "dark", "system"] as const).map((value) => (
              <Button
                key={value}
                variant={mounted && theme === value ? "default" : "outline"}
                onClick={() => setTheme(value)}
                className="capitalize">
                {value}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-semibold">Account</h2>
          {userEmail ? (
            <p className="text-sm">
              Signed in as{" "}
              <span className="font-medium text-foreground">{userEmail}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No profile loaded</p>
          )}
          <p className="text-xs text-muted-foreground">
            API:{" "}
            {process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api/v1"}
          </p>
        </Card>

        <Card className="p-6">
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            onClick={() => AdminAuth.logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </Card>
      </div>
    </div>
  );
}
