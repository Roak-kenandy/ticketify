export const APP_VERSION = "2.2.1";

export const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "+9609451335";

/** Medianet → CRM, Ooredoo → FMS. Use for any tech-facing copy. */
export type TicketSystem = "CRM" | "FMS";

export function isOoredooSource(
  ...sources: Array<string | null | undefined>
): boolean {
  return sources.some((source) => source === "OOREDOO");
}

/** Numeric FMS ticket ids (e.g. 176721). */
export function isOoredooTicketId(ticketId?: string | null): boolean {
  return /^[0-9]{3,12}$/.test(String(ticketId ?? "").trim());
}

export function ticketSystem(opts?: {
  userSource?: string | null;
  ticketSource?: string | null;
  ticketId?: string | null;
}): TicketSystem {
  if (
    isOoredooSource(opts?.userSource, opts?.ticketSource) ||
    isOoredooTicketId(opts?.ticketId)
  ) {
    return "FMS";
  }
  return "CRM";
}

export function syncWithSystemHint(system: TicketSystem = "CRM"): string {
  return `Tap refresh to sync with ${system}`;
}

/** CRM/FMS contact data is untrusted: only digits and a leading + may reach a tel: URL. */
export function dialable(phone?: string | null): string {
  return phone
    ? String(phone)
        .replace(/[^\d+]/g, "")
        .replace(/(?!^)\+/g, "")
    : "";
}
