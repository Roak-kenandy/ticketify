/** Read-only map + operations dashboard (no dispatch controls). */
export const OPS_VIEW_ROLES = ['Admin', 'Supervisor', 'Administrator', 'CEO'];

/** Dispatch toggles, manual assign, auto-assign settings. */
export const DISPATCH_MANAGE_ROLES = ['Admin', 'Supervisor', 'Administrator'];

/** User administration (create, reset password, deactivate, delete). */
export const ADMIN_ROLES = ['Admin', 'Administrator'];

/** Anyone who works tickets in the field app. */
export const FIELD_ROLES = ['Technician', ...DISPATCH_MANAGE_ROLES];

/** Office Inventory Team plus managers: consumption report, reconcile, adjust. */
export const INVENTORY_ROLES = ['Inventory', 'Supervisor', ...ADMIN_ROLES];

/** Item master, UOM and conversion maintenance. */
export const ITEM_MASTER_ROLES = ADMIN_ROLES;

/** Role names are compared case-insensitively ('TECHNICIAN' === 'Technician'). */
export function hasAnyRole(
  allowed: readonly string[],
  userRoles: unknown,
): boolean {
  const owned = (Array.isArray(userRoles) ? userRoles : [userRoles])
    .filter((role): role is string => typeof role === 'string')
    .map((role) => role.toLowerCase());
  return allowed.some((role) => owned.includes(role.toLowerCase()));
}
