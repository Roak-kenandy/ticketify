"use client";

import {
  Bell,
  ChevronRight,
  Headset,
  Info,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import { useDrawer } from "@/components/field/shell/app-shell";
import { ScreenHeader } from "@/components/field/shell/headers";
import { APP_VERSION, SUPPORT_PHONE } from "@/lib/field/app";
import { cn } from "@/lib/field/cn";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { humanize, initials, PRESENCE_META, presenceFromUser } from "@/lib/field/ticket-meta";
import { isTrackingStale, useTrackingSetup } from "@/lib/field/tracking";

function roleName(role: unknown): string | undefined {
  const name = typeof role === "string" ? role : (role as { name?: string } | null)?.name;
  return name ? humanize(name) : undefined;
}

function notificationState(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export default function AccountPage() {
  const { user } = useSession();
  const drawer = useDrawer();
  const { setup } = useTrackingSetup(0);
  const presence = PRESENCE_META[presenceFromUser(user)];
  const [notify, setNotify] = React.useState<NotificationPermission | "unsupported">("default");

  React.useEffect(() => setNotify(notificationState()), []);

  const enableNotifications = async () => {
    if (notify === "unsupported") {
      showError("This browser does not support notifications.");
      return;
    }
    if (notify === "denied") {
      showError("Notifications are blocked. Allow them in your browser site settings.");
      return;
    }
    const result = await Notification.requestPermission();
    setNotify(result);
    if (result === "granted") {
      showSuccess("You'll be notified about new jobs while this page is open.");
    }
  };

  const trackingHint = !setup
    ? "Share your location with dispatch using Traccar Client."
    : isTrackingStale(setup)
      ? "Not receiving your location. Tap to check the Traccar Client setup."
      : "Receiving your location.";

  return (
    <>
      <ScreenHeader title="Account" />
      <main className="mx-auto flex max-w-3xl flex-col gap-2 p-4 pb-16">
        <div className="flex items-center gap-4 rounded-lg bg-white p-5 shadow-card">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-bold text-primary">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-ink">{user?.name ?? "Technician"}</p>
            <p className="truncate text-[13px] text-gray2">{user?.email ?? ""}</p>
            <span
              className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ backgroundColor: presence.bg }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: presence.color }} />
              <span className="truncate text-xs font-semibold" style={{ color: presence.color }}>
                {presence.label}
                {user?.presence === "BUSY" && user?.busy_comment ? ` · ${user.busy_comment}` : ""}
              </span>
            </span>
          </div>
        </div>

        <GroupLabel>Details</GroupLabel>
        <Card>
          <Row icon={Mail} label="Email" value={user?.email} />
          <Row icon={Phone} label="Phone" value={user?.phone ?? user?.mobile} />
          <Row icon={ShieldCheck} label="Role" value={roleName(user?.role)} last />
        </Card>

        <GroupLabel>Security & device</GroupLabel>
        <Card>
          <Row icon={KeyRound} label="Change password" href="/field/account/password" />
          <Row icon={MapPin} label="Location tracking (Traccar)" hint={trackingHint} href="/field/tracking" />
          <Row
            icon={Bell}
            label="Job notifications"
            hint={
              notify === "granted"
                ? "On: new jobs raise a notification while this page is open."
                : "Get a notification when a new job is assigned to you."
            }
            value={notify === "granted" ? "On" : undefined}
            onPress={notify === "granted" ? undefined : enableNotifications}
            last
          />
        </Card>

        <GroupLabel>Help</GroupLabel>
        <Card>
          <Row icon={Headset} label="Call support" value={SUPPORT_PHONE} href={`tel:${SUPPORT_PHONE}`} />
          <Row icon={Info} label="App version" value={APP_VERSION} last />
        </Card>

        <button
          type="button"
          onClick={drawer.confirmSignOut}
          className="mt-4 flex h-[52px] items-center justify-center gap-2 rounded-md border border-error-bg bg-white text-base font-semibold text-error active:bg-error-bg"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </main>
    </>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 px-1 text-xs font-bold uppercase tracking-wide text-gray2">{children}</h2>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-white px-4 shadow-card">{children}</div>;
}

function Row({
  icon: Icon,
  label,
  value,
  hint,
  href,
  onPress,
  last,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  hint?: string;
  href?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const interactive = Boolean(href || onPress);
  const body = (
    <div className={cn("flex items-center gap-3 py-3.5", !last && "border-b border-borderlight")}>
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[15px] font-medium text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-gray2">{hint}</p> : null}
      </div>
      {value ? <span className="max-w-[45%] truncate text-sm text-gray2">{value}</span> : null}
      {interactive ? <ChevronRight className="h-[18px] w-[18px] shrink-0 text-gray3" /> : null}
    </div>
  );
  if (href) {
    return href.startsWith("tel:") ? (
      <a href={href} className="block">
        {body}
      </a>
    ) : (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} className="block w-full">
        {body}
      </button>
    );
  }
  return body;
}
