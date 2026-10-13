export const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9:._/-]{3,63}$/;

export function normalizeSerial(value?: string | null): string | null {
  const serial = value?.replace(/\s+/g, '').toUpperCase() ?? '';
  return serial || null;
}
