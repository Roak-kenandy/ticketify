/** Same rule as the API: starts alphanumeric, 4-64 chars of A-Z 0-9 : . _ / - */
export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9:._/-]{3,63}$/;

export function normalizeSerial(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function isValidSerial(value?: string | null): boolean {
  return SERIAL_PATTERN.test(normalizeSerial(value));
}

const MAC = /^([0-9A-F]{2}[:-]?){5}[0-9A-F]{2}$/;

/**
 * The GPON serial ("PON SN") as printed after "SN:" on the label and used by INCA,
 * e.g. 48575443686AEC86, or null if the value isn't one. The short vendor form
 * (HWTC686AEC86, shown by some OLTs and labels) is the same serial and is converted,
 * so one ONT never ends up under two serials.
 */
export function toPonSerial(value?: string | null): string | null {
  const serial = normalizeSerial(value).replace(/-/g, "");
  if (MAC.test(serial)) return null;
  if (/^(?:4[1-9A-F]|5[0-9A]){4}[0-9A-F]{8}$/.test(serial)) return serial;
  const vendor = serial.match(/^([A-Z]{4})([0-9A-F]{8})$/);
  if (!vendor) return null;
  const prefix = [...vendor[1]].map((letter) => letter.charCodeAt(0).toString(16).toUpperCase()).join("");
  return prefix + vendor[2];
}

/** How serials are stored: PON SNs as printed (16 hex), anything else as typed (no spaces, upper case). */
export function canonicalSerial(value?: string | null): string {
  return toPonSerial(value) ?? normalizeSerial(value);
}

/** Items whose serial is the ONT's PON SN; other barcodes on their label are ignored. */
export function isOntItem(item: { name: string; category?: string | null }): boolean {
  return /\bONT\b/i.test(item.name) || /\bONT\b/i.test(item.category ?? "");
}

/**
 * ONT labels often encode several fields ("SN:48575443686AEC86;MAC:…"). Prefer
 * an explicit SN/serial field, otherwise the first token that looks like a serial.
 */
export function extractSerial(raw: string): string | null {
  const text = raw.trim();
  const labelled = text.match(
    /(?:^|[\s;,|])(?:G?PON\s*SN|S\/?N|SERIAL(?:\s*NO)?)\s*[:=#]?\s*([A-Za-z0-9:._/-]{4,64})/i,
  );
  if (labelled && isValidSerial(labelled[1])) {
    return canonicalSerial(labelled[1]);
  }
  const whole = normalizeSerial(text);
  if (!/[\s;,|]/.test(text) && isValidSerial(whole)) {
    return canonicalSerial(whole);
  }
  const token = text
    .split(/[\s;,|]+/)
    .map(normalizeSerial)
    .find((candidate) => isValidSerial(candidate) && /\d/.test(candidate));
  return token ? canonicalSerial(token) : null;
}

/** Every PON SN found in a scanned text (a QR code can hold several fields). */
export function ponSerialsIn(raw: string): string[] {
  return raw
    .split(/[\s;,|]+/)
    .flatMap((part) => part.split(/[:=#]/))
    .map((token) => toPonSerial(token))
    .filter((serial): serial is string => Boolean(serial));
}
