import { resolveAccess, UserAccess } from './access';

/** Built-in roles as the dynamic_rbac migration sets them up; for specs. */
const role = (
  flags: Partial<
    Record<
      'full_access' | 'field_technician' | 'stock_holder' | 'store',
      boolean
    >
  >,
  permissions: Record<string, string> = {},
) =>
  resolveAccess({
    full_access: false,
    field_technician: false,
    stock_holder: false,
    store: false,
    ...flags,
    permissions: Object.entries(permissions).map(([screen, level]) => ({
      screen,
      level,
    })),
  });

export const ACCESS: Record<
  'admin' | 'technician' | 'supervisor' | 'inventory' | 'finance' | 'ceo',
  UserAccess
> = {
  admin: role({ full_access: true }),
  technician: role({ field_technician: true }, { technician_app: 'VIEW' }),
  supervisor: role(
    { stock_holder: true },
    {
      live_map: 'VIEW',
      dashboard: 'VIEW',
      operations_board: 'DELETE',
      auto_assign: 'EDIT',
      technician_app: 'VIEW',
      master_report: 'VIEW',
      ticket_aging: 'VIEW',
      finance_overview: 'EDIT',
      payments: 'VIEW',
      inventory_consumption: 'EDIT',
      stock: 'EDIT',
      stock_report: 'VIEW',
      item_master: 'VIEW',
      provisioning_log: 'VIEW',
      team_overview: 'VIEW',
      users: 'VIEW',
    },
  ),
  inventory: role(
    { store: true },
    {
      inventory_consumption: 'EDIT',
      stock: 'EDIT',
      stock_report: 'VIEW',
      item_master: 'VIEW',
    },
  ),
  finance: role({}, { finance_overview: 'EDIT', payments: 'VIEW' }),
  ceo: role(
    {},
    { live_map: 'VIEW', operations_board: 'VIEW', provisioning_log: 'VIEW' },
  ),
};
