"use client";

import React from "react";
import { apiGet, apiPost } from "./api";
import { useSession } from "./session";

export type TrackingSetup = {
  device_id: string;
  server_url: string | null;
  presence: "ONLINE" | "BUSY" | "OFFLINE";
  last_point_at: string | null;
  last_point_accuracy: number | null;
  /** Last time Traccar Client contacted the server, even when the point was not stored. */
  last_seen_at: string | null;
  is_moving?: boolean | null;
  motion_since?: string | null;
  battery_level?: number | null;
  is_charging?: boolean | null;
  recommended: {
    distance_m: number;
    interval_s: number;
    accuracy: string;
    stop_detection?: boolean;
    heartbeat_s?: number;
    wake_lock?: boolean;
  };
};

/**
 * Same rules as the admin live map: a moving phone sends every 15 s (60 s on older setups); a stationary one only
 * sends its heartbeat (5 min, which Android may stretch to ~10 min).
 */
export const TRACKING_RULES = {
  movingSilenceMs: 3 * 60 * 1000,
  stationarySilenceMs: 15 * 60 * 1000,
};

/** Newest proof that the phone is reporting. */
export function lastHeardAt(setup: TrackingSetup | null): string | null {
  const times = [setup?.last_seen_at, setup?.last_point_at].filter((value): value is string => Boolean(value));
  return times.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export function useTrackingSetup(pollMs = 30000) {
  const { token } = useSession();
  const [setup, setSetup] = React.useState<TrackingSetup | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      setSetup(await apiGet("/users/me/tracking", token, { silent: true }));
      setError("");
    } catch (err: any) {
      setError(err?.message || "Could not load tracking settings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const reset = React.useCallback(async () => {
    const next = await apiPost("/users/me/tracking/reset", {}, token);
    setSetup(next);
    return next as TrackingSetup;
  }, [token]);

  React.useEffect(() => {
    load();
    if (!pollMs) {
      return;
    }
    const id = window.setInterval(load, pollMs);
    return () => window.clearInterval(id);
  }, [load, pollMs]);

  return { setup, error, loading, reload: load, reset };
}

export function isTrackingStale(setup: TrackingSetup | null): boolean {
  const heard = lastHeardAt(setup);
  if (!heard) {
    return true;
  }
  const silence = Date.now() - Date.parse(heard);
  const limit = setup?.is_moving === true ? TRACKING_RULES.movingSilenceMs : TRACKING_RULES.stationarySilenceMs;
  return silence > limit;
}
