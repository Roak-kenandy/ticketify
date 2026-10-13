/** Device identifiers we issue, and what Traccar Client accepts as an id. */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]{4,64}$/;

export type TraccarFix = {
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** ISO time the phone took the fix. */
  timestamp: string | undefined;
  mock: boolean;
  /** Traccar's motion state: false once stop detection decides the phone is stationary. */
  isMoving: boolean | null;
  /** Battery percentage 0–100. */
  battery: number | null;
  charging: boolean | null;
};

export type ParseResult =
  | { ok: true; fixes: TraccarFix[] }
  | { ok: false; reason: string };

type Source = Record<string, unknown>;

function asRecord(value: unknown): Source | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Source)
    : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

/** Legacy clients send unix seconds (or ms); v9 sends ISO 8601. */
function toIsoTimestamp(raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  const numeric = toNumber(raw);
  if (numeric !== null) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof raw === 'string') {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 0) {
    return false;
  }
  return null;
}

/** v9 reports 0–1 (or -1 when unknown); legacy clients report 0–100. */
function toBatteryPercent(raw: unknown, fraction: boolean): number | null {
  const value = toNumber(raw);
  if (value === null || value < 0) {
    return null;
  }
  const percent = fraction && value <= 1 ? value * 100 : value;
  return percent <= 100 ? Math.round(percent) : null;
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  return (
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // 0,0 is what some phones report before the first real fix.
    !(latitude === 0 && longitude === 0)
  );
}

function fromJsonLocation(
  deviceId: string,
  location: Source,
): TraccarFix | null {
  const coords = asRecord(location.coords) ?? {};
  const latitude = toNumber(coords.latitude);
  const longitude = toNumber(coords.longitude);
  if (!validCoordinates(latitude, longitude)) {
    return null;
  }
  const battery = asRecord(location.battery) ?? {};
  return {
    deviceId,
    latitude: latitude as number,
    longitude: longitude as number,
    accuracy: toNumber(coords.accuracy),
    timestamp: toIsoTimestamp(location.timestamp),
    mock: location.mock === true || location.mock === 'true',
    isMoving: toBoolean(location.is_moving),
    battery: toBatteryPercent(battery.level, true),
    charging: toBoolean(battery.is_charging),
  };
}

/**
 * Accepts both Traccar Client formats:
 *  - v9+: JSON `{ device_id, location: { timestamp, coords: {...}, mock } }`
 *    (some builds batch `location` as an array);
 *  - legacy OsmAnd: query or form fields `id`, `lat`, `lon`, `timestamp`, `accuracy`.
 * The JSON body also carries a `_` field with an `&id=` fragment that can be
 * stale, so the top-level `device_id` always wins.
 */
export function parseTraccarPayload(
  query: unknown,
  body: unknown,
): ParseResult {
  const q = asRecord(query) ?? {};
  const b = asRecord(body) ?? {};

  const deviceId = firstString(
    b.device_id,
    b.deviceId,
    b.id,
    b.deviceid,
    q.id,
    q.deviceid,
    q.device_id,
  );
  if (!deviceId) {
    return { ok: false, reason: 'missing_device_id' };
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    return { ok: false, reason: 'invalid_device_id' };
  }

  const locations = Array.isArray(b.location)
    ? b.location.map(asRecord).filter((l): l is Source => l !== null)
    : asRecord(b.location)
      ? [asRecord(b.location) as Source]
      : [];
  if (locations.length) {
    const fixes = locations
      .map((location) => fromJsonLocation(deviceId, location))
      .filter((fix): fix is TraccarFix => fix !== null);
    return fixes.length
      ? { ok: true, fixes }
      : { ok: false, reason: 'invalid_coordinates' };
  }

  const pick = (key: string) => (b[key] !== undefined ? b[key] : q[key]);
  const latitude = toNumber(pick('lat') ?? pick('latitude'));
  const longitude = toNumber(pick('lon') ?? pick('lng') ?? pick('longitude'));
  if (!validCoordinates(latitude, longitude)) {
    return { ok: false, reason: 'invalid_coordinates' };
  }
  return {
    ok: true,
    fixes: [
      {
        deviceId,
        latitude: latitude as number,
        longitude: longitude as number,
        accuracy: toNumber(pick('accuracy')),
        timestamp: toIsoTimestamp(pick('timestamp')),
        mock: pick('mock') === true || pick('mock') === 'true',
        isMoving: toBoolean(pick('is_moving') ?? pick('motion')),
        battery: toBatteryPercent(pick('batt') ?? pick('battery'), false),
        charging: toBoolean(pick('charge')),
      },
    ],
  };
}
