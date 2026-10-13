/** Same rule as the API: starts alphanumeric, 4-64 chars of A-Z 0-9 : . _ / - */
export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9:._/-]{3,63}$/;

export function normalizeSerial(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function isValidSerial(value?: string | null): boolean {
  return SERIAL_PATTERN.test(normalizeSerial(value));
}

/**
 * ONT labels often encode several fields ("SN:HWTC1234ABCD;MAC:…"). Prefer
 * an explicit SN/serial field, otherwise the first token that looks like a serial.
 */
export function extractSerial(raw: string): string | null {
  const text = raw.trim();
  const labelled = text.match(
    /(?:^|[\s;,|])(?:S\/?N|SERIAL(?:\s*NO)?|GPON\s*SN)\s*[:=#]?\s*([A-Za-z0-9:._/-]{4,64})/i,
  );
  if (labelled && isValidSerial(labelled[1])) {
    return normalizeSerial(labelled[1]);
  }
  const whole = normalizeSerial(text);
  if (isValidSerial(whole)) {
    return whole;
  }
  const token = text
    .split(/[\s;,|]+/)
    .map(normalizeSerial)
    .find((candidate) => isValidSerial(candidate) && /\d/.test(candidate));
  return token ?? null;
}
