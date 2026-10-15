import moment from "moment";

export type TechnicianPresenceState = "online" | "busy" | "offline";

export type TechnicianPresenceSource = {
  presence?: "ONLINE" | "BUSY" | "OFFLINE" | string | null;
  availability?: boolean;
};

export function resolveTechnicianPresence(
  tech: TechnicianPresenceSource | null | undefined,
): TechnicianPresenceState {
  if (tech?.presence === "ONLINE") {
    return "online";
  }
  if (tech?.presence === "BUSY") {
    return "busy";
  }
  if (tech?.presence === "OFFLINE") {
    return "offline";
  }
  return tech?.availability ? "online" : "offline";
}

export type TrackingState = {
  last_seen_at?: string | null;
  is_moving?: boolean | null;
  motion_since?: string | null;
  battery_level?: number | null;
  is_charging?: boolean | null;
};

/**
 * Traccar Client sends every 15 s while moving (60 s on older setups). Once stop detection decides the phone is
 * stationary it pauses GPS and only sends a heartbeat (set to 5 min; Android may stretch it to
 * ~10 min). Silence is therefore judged against what the phone last said it was doing.
 */
export const TRACKING_RULES = {
  movingSilenceMs: 3 * 60 * 1000,
  stationarySilenceMs: 15 * 60 * 1000,
  lowBatteryPercent: 20,
};

export type TrackingSignal =
  | { kind: "off_shift" }
  | { kind: "moving"; heardAt: number }
  | { kind: "stopped"; heardAt: number; since: number | null }
  | { kind: "no_signal"; heardAt: number | null };

function toMs(value?: string | null): number {
  return value ? Date.parse(value) : NaN;
}

export function trackingSignal(
  presence: TechnicianPresenceState,
  device: TrackingState | null | undefined,
  lastPointAt?: string | null,
  now = Date.now(),
): TrackingSignal {
  if (presence === "offline") {
    return { kind: "off_shift" };
  }
  const heard = [toMs(device?.last_seen_at), toMs(lastPointAt)].filter(Number.isFinite);
  if (!heard.length) {
    return { kind: "no_signal", heardAt: null };
  }
  const heardAt = Math.max(...heard);
  const silence = now - heardAt;
  const stationary = device?.is_moving === false;
  if (silence <= TRACKING_RULES.movingSilenceMs) {
    return stationary
      ? { kind: "stopped", heardAt, since: Number.isFinite(toMs(device?.motion_since)) ? toMs(device?.motion_since) : null }
      : { kind: "moving", heardAt };
  }
  // Moving phones (and older app builds that never report motion) send every minute or faster.
  if (device?.is_moving !== true && silence <= TRACKING_RULES.stationarySilenceMs) {
    const since = toMs(device?.motion_since);
    return { kind: "stopped", heardAt, since: stationary && Number.isFinite(since) ? since : null };
  }
  return { kind: "no_signal", heardAt };
}

/** One-line description for markers, the list and the details panel; null when off shift. */
export function describeSignal(signal: TrackingSignal): string | null {
  switch (signal.kind) {
    case "moving":
      return `Moving · updated ${moment(signal.heardAt).fromNow()}`;
    case "stopped":
      return signal.since
        ? `Stopped since ${moment(signal.since).format("h:mm A")} (${moment(signal.since).fromNow(true)})`
        : `Stopped · updated ${moment(signal.heardAt).fromNow()}`;
    case "no_signal":
      return signal.heardAt
        ? `No location signal · last seen ${moment(signal.heardAt).fromNow()}`
        : "No location signal";
    default:
      return null;
  }
}

export function isLowBattery(device: TrackingState | null | undefined): boolean {
  return (
    typeof device?.battery_level === "number" &&
    device.battery_level <= TRACKING_RULES.lowBatteryPercent &&
    device.is_charging !== true
  );
}

export const PRESENCE_UI: Record<
  TechnicianPresenceState,
  {
    markerColor: string;
    label: string;
    dotClass: string;
    textClass: string;
    pulseClass: string;
    badge: "success" | "warning" | "outline";
  }
> = {
  online: {
    markerColor: "#10b981",
    label: "Available",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
    pulseClass: "bg-emerald-500",
    badge: "success",
  },
  busy: {
    markerColor: "#f59e0b",
    label: "Busy",
    dotClass: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
    pulseClass: "bg-amber-500",
    badge: "warning",
  },
  offline: {
    markerColor: "#94a3b8",
    label: "Offline",
    dotClass: "bg-slate-400",
    textClass: "text-muted-foreground",
    pulseClass: "bg-slate-400",
    badge: "outline",
  },
};
