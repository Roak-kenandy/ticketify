export const APP_VERSION = "2.2.1";

export const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "+9609451335";

/** CRM data is untrusted: only digits and a leading + may reach a tel: URL. */
export function dialable(phone?: string | null): string {
  return phone
    ? String(phone)
        .replace(/[^\d+]/g, "")
        .replace(/(?!^)\+/g, "")
    : "";
}
