"use client";

import { Check, Copy, MapPin, MapPinOff, Moon, RefreshCw, RotateCcw } from "lucide-react";
import moment from "moment";
import React from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import { ConfirmDialog } from "@/components/field/ui/confirm-dialog";
import { ErrorState, InlineBanner, Skeleton } from "@/components/field/ui/state-views";
import { cn } from "@/lib/field/cn";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { presenceFromUser } from "@/lib/field/ticket-meta";
import { isTrackingStale, useTrackingSetup } from "@/lib/field/tracking";

const PLAY_STORE = "https://play.google.com/store/apps/details?id=org.traccar.client";
const APP_STORE = "https://apps.apple.com/app/traccar-client/id843156974";

export default function TrackingPage() {
  const { user } = useSession();
  const { setup, error, loading, reload, reset } = useTrackingSetup(30000);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const onShift = presenceFromUser(user) !== "OFFLINE";
  const stale = isTrackingStale(setup);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const onReset = async () => {
    setResetting(true);
    try {
      await reset();
      showSuccess("New device identifier created. Enter it in Traccar Client.");
      setConfirmReset(false);
    } catch (err: any) {
      showError(err?.message || "Could not reset the device identifier");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Location tracking" subtitle="Share your location with dispatch using Traccar Client" />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-16">
        {loading && !setup ? (
          <div className="flex flex-col gap-3 rounded-lg bg-white p-5 shadow-card">
            <Skeleton width="50%" height={18} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : error && !setup ? (
          <ErrorState message={error} onRetry={onRefresh} />
        ) : setup ? (
          <>
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg p-4 shadow-card",
                !onShift ? "bg-white" : stale ? "bg-warning-bg" : "bg-success-bg",
              )}
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                  !onShift ? "bg-surface text-gray2" : stale ? "bg-white text-warning" : "bg-white text-success",
                )}
              >
                {!onShift ? <Moon className="h-5 w-5" /> : stale ? <MapPinOff className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className={cn("text-base font-bold", !onShift ? "text-ink" : stale ? "text-warning" : "text-success")}>
                  {!onShift ? "Not sharing (Offline)" : stale ? "Not receiving your location" : "Receiving your location"}
                </p>
                <p className="mt-0.5 text-[13px] text-gray2">
                  {setup.last_point_at
                    ? `Last point ${moment(setup.last_point_at).fromNow()} (${moment(setup.last_point_at).format("h:mm A, DD MMM")})${
                        setup.last_point_accuracy != null ? ` · ±${Math.round(setup.last_point_accuracy)} m` : ""
                      }`
                    : "No location received yet."}
                </p>
                {setup.last_seen_at ? (
                  <p className="mt-0.5 text-[13px] text-gray2">
                    Traccar Client last checked in {moment(setup.last_seen_at).fromNow()}
                    {setup.is_moving === false
                      ? ` · stopped${setup.motion_since ? ` since ${moment(setup.motion_since).format("h:mm A")}` : ""}`
                      : setup.is_moving === true
                        ? " · moving"
                        : ""}
                    {typeof setup.battery_level === "number"
                      ? ` · battery ${setup.battery_level}%${setup.is_charging ? " (charging)" : ""}`
                      : ""}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-gray2">
                  Locations are saved only while you are Available or Busy. Switch to Offline when your shift ends.
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh status"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary"
              >
                <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </button>
            </div>

            <section className="flex flex-col gap-3 rounded-lg bg-white p-5 shadow-card">
              <h2 className="text-base font-semibold text-ink">Your Traccar Client settings</h2>
              <p className="text-[13px] text-gray2">
                Enter these two values in Traccar Client on your phone. The server URL is the same for every technician;
                the device identifier is yours only.
              </p>
              {setup.server_url ? (
                <CopyField label="Server URL" value={setup.server_url} />
              ) : (
                <InlineBanner
                  tone="error"
                  message="The server URL is not configured yet. Ask an administrator to set TRACCAR_SERVER_URL on the API."
                />
              )}
              <CopyField label="Device identifier" value={setup.device_id} mono />
              <div className="mt-1 grid grid-cols-1 gap-2 rounded-md bg-surface p-3 sm:grid-cols-2">
                <Setting label="Location accuracy" value="High" />
                <Setting label="Distance" value={`${setup.recommended.distance_m} m`} />
                <Setting label="Interval" value={`${setup.recommended.interval_s} s`} />
                <Setting label="Offline buffering" value="On" />
                <Setting label="Stop detection (Advanced)" value={setup.recommended.stop_detection ? "On" : "Off"} />
                {setup.recommended.heartbeat_s ? (
                  <Setting label="Stationary heartbeat (Advanced)" value={`${setup.recommended.heartbeat_s} s`} />
                ) : null}
                <Setting label="Wake lock (Advanced)" value={setup.recommended.wake_lock === false ? "Off" : "On"} />
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-lg bg-white p-5 shadow-card">
              <h2 className="text-base font-semibold text-ink">Set up on your phone</h2>
              <ol className="flex flex-col gap-3">
                <Step n={1}>
                  Install <b>Traccar Client</b> from the{" "}
                  <a className="font-semibold text-info underline" href={PLAY_STORE} target="_blank" rel="noreferrer">
                    Play Store
                  </a>{" "}
                  or{" "}
                  <a className="font-semibold text-info underline" href={APP_STORE} target="_blank" rel="noreferrer">
                    App Store
                  </a>
                  .
                </Step>
                <Step n={2}>
                  Open it and paste the <b>Device identifier</b> and <b>Server URL</b> shown above. Use the
                  copy buttons: the URL must start with <b>https://</b> and end with <b>/tracking/traccar</b>, and
                  the identifier must match exactly (it starts with <b>tk-</b>).
                </Step>
                <Step n={3}>
                  Set <b>Location accuracy</b> to High, <b>Distance</b> to {setup.recommended.distance_m} m and{" "}
                  <b>Interval</b> to {setup.recommended.interval_s} s. Under <b>Advanced</b>, keep{" "}
                  <b>Stop detection on</b>, set <b>Stationary heartbeat</b> to {setup.recommended.heartbeat_s ?? 300} s
                  and turn <b>Wake lock on</b>. While you work on site the app saves battery and checks in every few
                  minutes; dispatch sees “Stopped”, not “No location signal”.
                </Step>
                <Step n={4}>
                  When asked, allow location <b>“Allow all the time”</b>, keep Traccar notifications on, and set the
                  app&apos;s battery usage to <b>Unrestricted</b> so Android does not stop it.
                </Step>
                <Step n={5}>
                  Switch on <b>Service status</b> (continuous tracking) and leave the app running in the background.
                </Step>
                <Step n={6}>
                  Set yourself to <b>Available</b> on the Dashboard. This page shows “Receiving your location” within a
                  couple of minutes.
                </Step>
              </ol>
            </section>

            <section className="flex flex-col gap-2 rounded-lg bg-white p-5 shadow-card">
              <h2 className="text-base font-semibold text-ink">Changed or lost your phone?</h2>
              <p className="text-[13px] text-gray2">
                Create a new device identifier. The old one stops working immediately, so enter the new one in Traccar
                Client on your current phone.
              </p>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="mt-1 flex items-center justify-center gap-2 self-start rounded-md border border-bordergray px-4 py-2.5 text-sm font-semibold text-ink"
              >
                <RotateCcw className="h-4 w-4" />
                New device identifier
              </button>
            </section>
          </>
        ) : null}
      </main>

      <ConfirmDialog
        open={confirmReset}
        title="Create a new device identifier?"
        message="Traccar Client stops sending your location until you enter the new identifier in it."
        confirmText="Create new"
        destructive
        loading={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={onReset}
      />
    </>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      inputRef.current?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="caption">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className={cn("input h-11 flex-1 bg-surface text-sm", mono && "font-mono tracking-wide")}
        />
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className={cn(
            "flex h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold",
            copied ? "bg-success-bg text-success" : "bg-tertiary text-primary",
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] text-gray2">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
        {n}
      </span>
      <span className="text-sm leading-6 text-ink">{children}</span>
    </li>
  );
}
