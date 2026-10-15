/**
 * Decides whether a phone fix is trustworthy enough to move a technician on the live map.
 *
 * Phones fall back to Wi-Fi / cell positioning indoors. Those fixes can be kilometres off
 * (e.g. in the sea) while still reporting a small accuracy radius, so accuracy alone is not
 * enough: a fix that implies an impossible speed, or a jump over 1 km, from the last stored
 * point is held back until several distinct fixes agree on the new place, or form a
 * plausible track (a technician riding away keeps moving, so never settles in one spot).
 */

export type LocationFix = {
  latitude: number;
  longitude: number;
  /** Metres; null when the device did not report one. */
  accuracy: number | null;
  at: Date;
};

export type StoredPoint = {
  latitude: number;
  longitude: number;
  created_at: Date;
};

export type PendingMove = {
  latitude: number;
  longitude: number;
  last_latitude: number;
  last_longitude: number;
  /** Distinct fixes seen at the new place, or along a plausible track from it. */
  count: number;
  first_at: Date;
  /** Time of the latest held-back fix; absent on moves held before tracks were accepted. */
  last_at?: Date;
};

export const LOCATION_RULES = {
  /** Fixes worse than this are dropped while a recent point exists. */
  goodAccuracyM: 100,
  /** Fixes worse than this are never stored. */
  maxAccuracyM: 500,
  /** How long a good point keeps coarse fixes out. */
  coarseGraceMs: 10 * 60 * 1000,
  /** ~150 km/h covers cars and speedboats; anything faster is a positioning error. */
  maxSpeedMps: 42,
  /** Slack added to the speed limit for normal GPS wander. */
  jumpToleranceM: 300,
  /**
   * Tracking every 15 s never produces a single step this long, so any such jump (e.g. after
   * the phone lost GPS indoors) must be confirmed however much time has passed.
   */
  confirmJumpOverM: 1000,
  /** A held-back move is accepted once this many distinct fixes agree... */
  confirmFixes: 3,
  /** ...within this radius of each other... */
  confirmRadiusM: 150,
  /** ...spread over at least this long. */
  confirmMinSpanMs: 45 * 1000,
  /** A held-back move older than this is forgotten. */
  pendingTtlMs: 5 * 60 * 1000,
};

export type FixDecision =
  | { action: 'store' }
  | { action: 'skip'; reason: 'inaccurate' | 'coarse' | 'jump' }
  | { action: 'hold'; pending: PendingMove };

export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function normalizeAccuracy(raw: unknown): number | null {
  const value = Number(raw);
  // Android reports 0 when the provider has no accuracy; that is "unknown", not "perfect".
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function evaluateFix(
  fix: LocationFix,
  last: StoredPoint | null,
  pending: PendingMove | null,
  rules = LOCATION_RULES,
): FixDecision {
  if (fix.accuracy !== null && fix.accuracy > rules.maxAccuracyM) {
    return { action: 'skip', reason: 'inaccurate' };
  }
  if (!last) {
    return { action: 'store' };
  }

  const sinceLastMs = fix.at.getTime() - last.created_at.getTime();
  if (
    fix.accuracy !== null &&
    fix.accuracy > rules.goodAccuracyM &&
    sinceLastMs < rules.coarseGraceMs
  ) {
    return { action: 'skip', reason: 'coarse' };
  }
  // Offline-synced fixes arrive older than the current point; they only fill the trail.
  if (sinceLastMs <= 0) {
    return fix.accuracy !== null && fix.accuracy <= rules.goodAccuracyM
      ? { action: 'store' }
      : { action: 'skip', reason: 'coarse' };
  }

  const moved = distanceM(last, fix);
  const allowed = Math.min(
    (rules.maxSpeedMps * sinceLastMs) / 1000 +
      rules.jumpToleranceM +
      (fix.accuracy ?? 0),
    rules.confirmJumpOverM,
  );
  if (moved <= allowed) {
    return { action: 'store' };
  }

  const fresh =
    pending &&
    fix.at.getTime() - pending.first_at.getTime() <= rules.pendingTtlMs
      ? pending
      : null;
  const settled = fresh && distanceM(fresh, fix) <= rules.confirmRadiusM;
  const onTrack = fresh && !settled && followsTrack(fix, fresh, rules);
  if (fresh && (settled || onTrack)) {
    // A stuck network / cached fix repeats the exact same coordinates; real GPS always jitters.
    const repeated =
      fix.latitude === fresh.last_latitude &&
      fix.longitude === fresh.last_longitude;
    if (repeated) {
      return { action: 'hold', pending: fresh };
    }
    const next: PendingMove = {
      ...fresh,
      ...(onTrack ? { latitude: fix.latitude, longitude: fix.longitude } : {}),
      count: fresh.count + 1,
      last_latitude: fix.latitude,
      last_longitude: fix.longitude,
      last_at: fix.at,
    };
    if (
      next.count >= rules.confirmFixes &&
      fix.at.getTime() - fresh.first_at.getTime() >= rules.confirmMinSpanMs
    ) {
      return { action: 'store' };
    }
    return { action: 'hold', pending: next };
  }
  return {
    action: 'hold',
    pending: {
      latitude: fix.latitude,
      longitude: fix.longitude,
      last_latitude: fix.latitude,
      last_longitude: fix.longitude,
      count: 1,
      first_at: fix.at,
      last_at: fix.at,
    },
  };
}

/** An accurate fix reachable at road speed from the previous held-back fix. */
function followsTrack(
  fix: LocationFix,
  pending: PendingMove,
  rules: typeof LOCATION_RULES,
): boolean {
  if (
    !pending.last_at ||
    fix.accuracy === null ||
    fix.accuracy > rules.goodAccuracyM
  ) {
    return false;
  }
  const stepMs = fix.at.getTime() - pending.last_at.getTime();
  if (stepMs <= 0) {
    return false;
  }
  const step = distanceM(
    { latitude: pending.last_latitude, longitude: pending.last_longitude },
    fix,
  );
  return (
    step <=
    Math.min(
      (rules.maxSpeedMps * stepMs) / 1000 + rules.jumpToleranceM + fix.accuracy,
      rules.confirmJumpOverM,
    )
  );
}
