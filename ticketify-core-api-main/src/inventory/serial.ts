export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9:._/-]{3,63}$/;

/** Short vendor form of a GPON serial: 4 letters + 8 hex, e.g. HWTC686AEC86 or HWTC-686AEC86. */
const PON_VENDOR = /^([A-Z]{4})-?([0-9A-F]{8})$/;

/**
 * Stored form of a serial: no spaces, upper case, and a GPON serial in the 16-hex
 * form printed after "SN:" on the label and used by INCA (48575443686AEC86). The
 * vendor form (HWTC686AEC86) is the same ONT and is converted, so both match.
 */
export function normalizeSerial(value?: string | null): string | null {
  const serial = value?.replace(/\s+/g, '').toUpperCase() ?? '';
  if (!serial) return null;
  const vendor = serial.match(PON_VENDOR);
  return vendor ? Buffer.from(vendor[1], 'ascii').toString('hex').toUpperCase() + vendor[2] : serial;
}
