import { edit, FULL_ACCESS, remove, Requirement, view } from './access';
import { SCREENS } from './screens';

/** Every screen at VIEW: for data any signed-in screen may need, e.g. ticket files. */
export const ANY_SCREEN: Requirement[] = SCREENS.map((screen) =>
  view(screen.key),
);

/** Any console screen; excludes the technician app, which is scoped per ticket. */
export const CONSOLE_ANY: Requirement[] = ANY_SCREEN.filter(
  (requirement) =>
    !('screen' in requirement) || requirement.screen !== 'technician_app',
);

export const FIELD: Requirement[] = [view('technician_app')];

/** Status board: the technician app home and the console Dashboard. */
export const STATUS_BOARD: Requirement[] = [
  view('technician_app'),
  view('dashboard'),
];

/** Map, operations board and dispatch data. */
export const OPS_VIEW: Requirement[] = [
  view('live_map'),
  view('operations_board'),
  view('auto_assign'),
  view('team_overview'),
];

export const DISPATCH_ASSIGN: Requirement[] = [edit('operations_board')];

export const CLOSURE_VIEW: Requirement[] = [...FIELD, ...OPS_VIEW];

export const ACTIVITY_VIEW: Requirement[] = [view('operations_board')];
export const ACTIVITY_EDIT: Requirement[] = [edit('operations_board')];
export const ACTIVITY_DELETE: Requirement[] = [remove('operations_board')];

export const AUTO_ASSIGN_VIEW: Requirement[] = [view('auto_assign')];
export const AUTO_ASSIGN_EDIT: Requirement[] = [edit('auto_assign')];

export const PROVISIONING_LOG: Requirement[] = [view('provisioning_log')];
export const PROVISIONING_TICKET_VIEW: Requirement[] = [
  ...FIELD,
  view('provisioning_log'),
  view('inventory_consumption'),
  ...OPS_VIEW,
];

export const TEAM_STATS: Requirement[] = [view('team_overview')];
export const USERS_VIEW: Requirement[] = [view('users'), view('team_overview')];
export const USERS_EDIT: Requirement[] = [edit('users')];
export const USERS_DELETE: Requirement[] = [remove('users')];
export const ROLES_MANAGE: Requirement[] = [FULL_ACCESS];

export const MASTER_REPORT: Requirement[] = [view('master_report')];
export const TICKET_AGING: Requirement[] = [view('ticket_aging')];
export const REPORT_FILTERS: Requirement[] = [
  ...MASTER_REPORT,
  ...TICKET_AGING,
];

export const FINANCE_SUMMARY: Requirement[] = [view('finance_overview')];
export const FINANCE_PENDING: Requirement[] = [
  view('finance_overview'),
  view('payments'),
];
export const FINANCE_REMIND: Requirement[] = [edit('finance_overview')];
export const PAYMENTS_REPORT: Requirement[] = [view('payments')];

export const ITEMS_VIEW: Requirement[] = [
  ...FIELD,
  view('item_master'),
  view('inventory_consumption'),
  view('stock'),
  view('stock_report'),
];
export const ITEMS_EDIT: Requirement[] = [edit('item_master')];

/** Materials on a ticket: technicians record them, the inventory team corrects them. */
export const TICKET_INVENTORY_VIEW: Requirement[] = [
  ...FIELD,
  view('inventory_consumption'),
];
export const TICKET_INVENTORY_EDIT: Requirement[] = [
  ...FIELD,
  edit('inventory_consumption'),
];
export const CONSUMPTION_VIEW: Requirement[] = [view('inventory_consumption')];
export const CONSUMPTION_EDIT: Requirement[] = [edit('inventory_consumption')];

export const STOCK_MINE: Requirement[] = [...FIELD, view('stock')];
export const STOCK_VIEW: Requirement[] = [
  view('stock'),
  view('stock_report'),
  view('inventory_consumption'),
];
export const STORE_EDIT: Requirement[] = [
  { screen: 'stock', level: 'EDIT', capability: 'store' },
];
export const HOLDER_EDIT: Requirement[] = [
  { screen: 'stock', level: 'EDIT', capability: 'stock_holder' },
];
export const STOCK_REQUESTS_VIEW: Requirement[] = [
  { screen: 'stock', level: 'VIEW', capability: 'store' },
  { screen: 'stock', level: 'VIEW', capability: 'stock_holder' },
];
export const STOCK_REQUESTS_EDIT: Requirement[] = [
  ...STORE_EDIT,
  ...HOLDER_EDIT,
];
