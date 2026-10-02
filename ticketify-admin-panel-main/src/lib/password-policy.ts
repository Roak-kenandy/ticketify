/** Mirrors the API rule in ticketify-core-api `auth/dto/change-password.dto.ts`. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password)) return "Include at least one letter.";
  if (!/\d/.test(password)) return "Include at least one number.";
  return null;
}
