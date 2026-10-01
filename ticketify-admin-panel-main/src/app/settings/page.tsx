"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  CloudOff,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { usePreferences, type SyncStatus } from "@/components/preferences-provider";
import { AdminAuth } from "@/lib/admin-auth";
import { hasAccess, initials, readSessionUser, type SessionUser } from "@/lib/access";
import type { Density, StartPage, TextSize, ThemePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const THEMES: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
  preview: string;
  bar: string;
}[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright, for daytime and offices",
    icon: Sun,
    preview: "bg-white border-slate-200",
    bar: "bg-slate-200",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Easier on the eyes at night",
    icon: Moon,
    preview: "bg-slate-900 border-slate-700",
    bar: "bg-slate-700",
  },
  {
    value: "system",
    label: "System",
    description: "Match this device's setting",
    icon: Monitor,
    preview: "bg-gradient-to-r from-white from-50% to-slate-900 to-50% border-slate-300",
    bar: "bg-slate-400",
  },
];

const START_PAGES: { value: StartPage; label: string; allowed: () => boolean }[] = [
  { value: "map", label: "Live map", allowed: () => hasAccess("ops") },
  { value: "operations", label: "Operations board", allowed: () => hasAccess("dispatch") },
  { value: "finance", label: "Finance overview", allowed: () => hasAccess("finance") },
];

export default function SettingsPage() {
  const { preferences, update, reset, status, synced } = usePreferences();
  const [mounted, setMounted] = React.useState(false);
  const [user, setUser] = React.useState<SessionUser | null>(null);

  React.useEffect(() => {
    setMounted(true);
    setUser(readSessionUser());
  }, []);

  const startPages = mounted ? START_PAGES.filter((page) => page.allowed()) : [];
  const startPageValue = startPages.some((page) => page.value === preferences.startPage)
    ? preferences.startPage
    : startPages[0]?.value;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Personal preferences are saved to your account and follow you to any device you sign in on."
        actions={<SaveStatus status={status} synced={synced} />}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {initials(user?.name || user?.email || "")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user?.name || "—"}</p>
              <p className="truncate text-sm text-muted-foreground">{user?.email || "No profile loaded"}</p>
            </div>
            {user?.role && <Badge variant="brand">{user.role}</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose light or dark mode, or follow your device.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
              {THEMES.map((item) => {
                const active = mounted && preferences.theme === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => update({ theme: item.value })}
                    className={cn(
                      "group rounded-xl border-2 p-2 text-left transition-colors",
                      active ? "border-primary" : "border-transparent hover:border-border",
                    )}
                  >
                    <span className={cn("block h-20 rounded-lg border p-2", item.preview)}>
                      <span className={cn("block h-2 w-10 rounded-full", item.bar)} />
                      <span className={cn("mt-2 block h-2 w-16 rounded-full opacity-60", item.bar)} />
                    </span>
                    <span className="mt-2 flex items-center justify-between px-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        {item.label}
                      </span>
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </span>
                    <span className="block px-1 text-xs text-muted-foreground">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display</CardTitle>
            <CardDescription>Adjust spacing, text size and motion to suit how you work.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow
              id="density"
              title="Density"
              description="Compact fits more rows on screen in tables and lists."
            >
              <Segmented<Density>
                label="Density"
                value={preferences.density}
                onChange={(density) => update({ density })}
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                ]}
              />
            </SettingRow>
            <SettingRow id="text-size" title="Text size" description="Larger text across the whole console.">
              <Segmented<TextSize>
                label="Text size"
                value={preferences.textSize}
                onChange={(textSize) => update({ textSize })}
                options={[
                  { value: "default", label: "Default" },
                  { value: "large", label: "Large" },
                ]}
              />
            </SettingRow>
            <SettingRow
              id="reduce-motion"
              title="Reduce motion"
              description="Turn off animations such as live pulses and sliding panels."
            >
              <Switch
                checked={preferences.reduceMotion}
                onCheckedChange={(reduceMotion) => update({ reduceMotion })}
                aria-labelledby="reduce-motion-title"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Navigation</CardTitle>
            <CardDescription>Where you land after signing in, and how the sidebar starts.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow id="start-page" title="Start page" description="Opens after you sign in.">
              {startPages.length > 1 ? (
                <Select
                  value={startPageValue}
                  onValueChange={(value) => update({ startPage: value as StartPage })}
                >
                  <SelectTrigger className="w-48" aria-labelledby="start-page-title">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {startPages.map((page) => (
                      <SelectItem key={page.value} value={page.value}>
                        {page.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground">{startPages[0]?.label ?? "—"}</span>
              )}
            </SettingRow>
            <SettingRow
              id="sidebar"
              title="Collapse sidebar"
              description="Show icons only to give pages more room (desktop)."
            >
              <Switch
                checked={preferences.sidebarCollapsed}
                onCheckedChange={(sidebarCollapsed) => update({ sidebarCollapsed })}
                aria-labelledby="sidebar-title"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Reset your preferences or sign out of this browser.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset preferences
            </Button>
            <Button variant="destructive" onClick={() => AdminAuth.logout()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingRow({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p id={`${id}-title`} className="text-sm font-medium">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SaveStatus({ status, synced }: { status: SyncStatus; synced: boolean }) {
  const content =
    status === "saving"
      ? { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "Saving…", tone: "text-muted-foreground" }
      : status === "error"
        ? { icon: <AlertCircle className="h-3.5 w-3.5" />, text: "Couldn't save — changes apply on this device only", tone: "text-destructive" }
        : status === "offline"
          ? { icon: <CloudOff className="h-3.5 w-3.5" />, text: "Offline — using saved settings", tone: "text-muted-foreground" }
          : status === "saved" || synced
            ? { icon: <Check className="h-3.5 w-3.5" />, text: "Saved to your account", tone: "text-success" }
            : null;
  if (!content) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", content.tone)} role="status">
      {content.icon}
      {content.text}
    </span>
  );
}
