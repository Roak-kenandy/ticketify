"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MapPinned,
  MonitorPlay,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLockup } from "@/components/shell/brand";
import { AdminAuth } from "@/lib/admin-auth";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { primePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const ALLOWED_ROLES = ["Admin", "Administrator", "Supervisor", "CEO", "Finance"];

const HIGHLIGHTS = [
  {
    icon: MapPinned,
    title: "Live field map",
    text: "See every technician, their status and route in real time.",
  },
  {
    icon: MonitorPlay,
    title: "Operations board",
    text: "Unassigned, assigned and in-progress work across every region.",
  },
  {
    icon: BarChart3,
    title: "Reports & finance",
    text: "Master ticket reports, aging and payments — export in one click.",
  },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = AdminAuth.getToken();
    if (token && AdminAuth.isTokenValid(token)) {
      router.replace(AdminAuth.homePath());
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axiosInterceptorInstance.post("/auth/login", {
        email: email.trim(),
        password,
      });

      const roleName = response.data?.user?.role?.name ?? "";
      if (!ALLOWED_ROLES.includes(roleName)) {
        AdminAuth.clearSession();
        setError(
          "Your account doesn't have access to the operations console. Contact your administrator.",
        );
        return;
      }

      AdminAuth.setToken(response.data.access_token);
      if (response.data.refresh_token) {
        localStorage.setItem("refresh_token", response.data.refresh_token);
      }
      localStorage.setItem("user", JSON.stringify(response.data.user));
      await primePreferences();
      router.replace(AdminAuth.homePath());
    } catch (err: any) {
      AdminAuth.clearSession();
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        setError("That email and password combination is incorrect.");
      } else if (!err.response) {
        setError("Can't reach the server. Check your connection and try again.");
      } else {
        setError("Sign-in failed. Please try again in a moment.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function trackCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-navy-deep text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#0a5bb0_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#003366_0%,transparent_60%)]" />
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <BrandLockup inverted />

          <div className="max-w-md space-y-10">
            <div className="space-y-4">
              <h2 className="text-4xl font-semibold leading-tight tracking-tight xl:text-[44px]">
                Every ticket, every technician — one clear view.
              </h2>
              <p className="text-base text-white/70">
                The operations console for Medianet field teams across Malé,
                Hulhumalé and the transport network.
              </p>
            </div>
            <ul className="space-y-5">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                    <item.icon className="h-5 w-5 text-sky-200" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="block text-sm text-white/60">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Medianet · Ticketify
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-background px-5 py-12 sm:px-8">
        <div className="w-full max-w-[400px] space-y-8">
          <div className="lg:hidden">
            <BrandLockup />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Use your Ticketify staff account to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div
                role="alert"
                className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="name@medianet.mv"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  aria-invalid={Boolean(error) && !email.trim()}
                  className="h-11 pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={trackCapsLock}
                  onKeyDown={trackCapsLock}
                  autoComplete="current-password"
                  aria-invalid={Boolean(error) && !password}
                  className="h-11 pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p
                className={cn(
                  "text-xs text-warning transition-opacity",
                  capsLock ? "opacity-100" : "opacity-0",
                )}
                aria-live="polite"
              >
                {capsLock ? "Caps Lock is on" : "\u00a0"}
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Access is limited to authorised Medianet staff. Forgot your
            password? Ask an administrator to reset it.
          </p>
        </div>
      </main>
    </div>
  );
}
