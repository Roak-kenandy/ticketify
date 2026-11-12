/** Ordered from least to most access; each level includes the ones below it. */
export const ACCESS_LEVELS = ['VIEW', 'EDIT', 'DELETE'] as const;
export type Level = (typeof ACCESS_LEVELS)[number];

export type ScreenDef = {
  key: string;
  label: string;
  group: string;
  /** Highest level that means something on this screen. */
  max: Level;
  /** What each level allows, shown next to the choice in the console. */
  levels: Partial<Record<Level, string>>;
};

/**
 * Every screen a role can be given. Keys are stored in role_permissions and
 * user_permissions, so rename only with a data migration.
 */
export const SCREENS = [
  {
    key: 'live_map',
    label: 'Live map',
    group: 'Operations',
    max: 'VIEW',
    levels: { VIEW: 'See technicians and tickets on the map' },
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    group: 'Operations',
    max: 'VIEW',
    levels: { VIEW: 'Ticket status across all teams' },
  },
  {
    key: 'operations_board',
    label: 'Operations board',
    group: 'Operations',
    max: 'DELETE',
    levels: {
      VIEW: 'See open tickets by region',
      EDIT: 'Assign tickets and edit activities',
      DELETE: 'Delete activities',
    },
  },
  {
    key: 'auto_assign',
    label: 'Auto-assign',
    group: 'Operations',
    max: 'EDIT',
    levels: {
      VIEW: 'See settings and activity',
      EDIT: 'Change settings and run auto-assign',
    },
  },
  {
    key: 'technician_app',
    label: 'Technician app',
    group: 'Operations',
    max: 'VIEW',
    levels: { VIEW: 'Open and work tickets in the technician app' },
  },
  {
    key: 'master_report',
    label: 'Master report',
    group: 'Reports',
    max: 'VIEW',
    levels: { VIEW: 'View and export the master ticket report' },
  },
  {
    key: 'ticket_aging',
    label: 'Ticket aging',
    group: 'Reports',
    max: 'VIEW',
    levels: { VIEW: 'View and export ticket aging' },
  },
  {
    key: 'finance_overview',
    label: 'Finance overview',
    group: 'Finance',
    max: 'EDIT',
    levels: {
      VIEW: 'See totals and pending payments',
      EDIT: 'Send payment reminder SMS',
    },
  },
  {
    key: 'payments',
    label: 'Payments',
    group: 'Finance',
    max: 'VIEW',
    levels: { VIEW: 'View and export payments' },
  },
  {
    key: 'inventory_consumption',
    label: 'Consumption',
    group: 'Inventory',
    max: 'EDIT',
    levels: {
      VIEW: 'View and export materials used',
      EDIT: 'Adjust, reverse and correct closed tickets',
    },
  },
  {
    key: 'stock',
    label: 'Stock & hand-outs',
    group: 'Inventory',
    max: 'EDIT',
    levels: {
      VIEW: 'See who holds which stock',
      EDIT: 'Issue, hand out, take back and request stock',
    },
  },
  {
    key: 'stock_report',
    label: 'Stock report',
    group: 'Inventory',
    max: 'VIEW',
    levels: { VIEW: 'View and export stock movements' },
  },
  {
    key: 'item_master',
    label: 'Item master',
    group: 'Inventory',
    max: 'EDIT',
    levels: { VIEW: 'See items', EDIT: 'Create and edit items' },
  },
  {
    key: 'provisioning_log',
    label: 'Provisioning log',
    group: 'Inventory',
    max: 'VIEW',
    levels: { VIEW: 'See INCA provisioning runs' },
  },
  {
    key: 'team_overview',
    label: 'Team overview',
    group: 'Administration',
    max: 'VIEW',
    levels: { VIEW: 'See technician stats and details' },
  },
  {
    key: 'users',
    label: 'Users',
    group: 'Administration',
    max: 'DELETE',
    levels: {
      VIEW: 'See users',
      EDIT: 'Create users, edit them and reset passwords',
      DELETE: 'Deactivate and delete users',
    },
  },
] as const satisfies readonly ScreenDef[];

export type Screen = (typeof SCREENS)[number]['key'];

const BY_KEY = new Map<string, ScreenDef>(SCREENS.map((s) => [s.key, s]));

export function screenDef(key: string): ScreenDef | undefined {
  return BY_KEY.get(key);
}

export function levelRank(level: string | null | undefined): number {
  return level ? ACCESS_LEVELS.indexOf(level as Level) + 1 : 0;
}

/** Caps a level at what the screen supports; unknown screens get nothing. */
export function clampLevel(screen: string, level: Level): Level | null {
  const def = BY_KEY.get(screen);
  if (!def) return null;
  return levelRank(level) > levelRank(def.max) ? def.max : level;
}
