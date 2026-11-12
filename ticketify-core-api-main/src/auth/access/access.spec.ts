import { BadRequestException } from '@nestjs/common';
import {
  can,
  canSignIn,
  hasConsoleAccess,
  meetsAny,
  resolveAccess,
} from './access';
import { ACCESS } from './access.fixtures';
import { normalizeOverrides, normalizeRolePermissions } from './permissions';
import * as R from './requirements';

const finance = {
  full_access: false,
  field_technician: false,
  stock_holder: false,
  store: false,
  permissions: [
    { screen: 'finance_overview', level: 'VIEW' },
    { screen: 'payments', level: 'VIEW' },
  ],
};

describe('resolveAccess', () => {
  it('starts from the role and applies user overrides on its screens only', () => {
    const access = resolveAccess(finance, [
      { screen: 'finance_overview', level: 'EDIT' },
      { screen: 'payments', level: 'NONE' },
      { screen: 'users', level: 'DELETE' },
    ]);
    expect(access.permissions).toEqual({ finance_overview: 'EDIT' });
  });

  it('caps levels at what each screen supports', () => {
    const access = resolveAccess(
      { ...finance, permissions: [{ screen: 'payments', level: 'DELETE' }] },
      [],
    );
    expect(access.permissions).toEqual({ payments: 'VIEW' });
  });

  it('ignores screens that no longer exist', () => {
    const access = resolveAccess(
      {
        ...finance,
        permissions: [{ screen: 'retired_screen', level: 'VIEW' }],
      },
      [],
    );
    expect(access.permissions).toEqual({});
    expect(canSignIn(access)).toBe(false);
  });

  it('gives full access every screen at its top level and the store', () => {
    const access = resolveAccess({ ...finance, full_access: true }, [
      { screen: 'users', level: 'NONE' },
    ]);
    expect(access.permissions.users).toBe('DELETE');
    expect(access.permissions.live_map).toBe('VIEW');
    expect(access.store).toBe(true);
    expect(access.stock_holder).toBe(false);
  });
});

describe('can / meetsAny', () => {
  it('treats higher levels as including the lower ones', () => {
    expect(can(ACCESS.supervisor, 'operations_board', 'EDIT')).toBe(true);
    expect(can(ACCESS.supervisor, 'auto_assign', 'EDIT')).toBe(true);
    expect(can(ACCESS.supervisor, 'users', 'EDIT')).toBe(false);
    expect(can(ACCESS.finance, 'finance_overview', 'VIEW')).toBe(true);
  });

  it('requires the capability as well as the screen level', () => {
    expect(meetsAny(ACCESS.inventory, R.STORE_EDIT)).toBe(true);
    expect(meetsAny(ACCESS.supervisor, R.STORE_EDIT)).toBe(false);
    expect(meetsAny(ACCESS.supervisor, R.HOLDER_EDIT)).toBe(true);
    expect(meetsAny(ACCESS.inventory, R.HOLDER_EDIT)).toBe(false);
    expect(meetsAny(ACCESS.admin, R.STORE_EDIT)).toBe(true);
    expect(meetsAny(ACCESS.admin, R.HOLDER_EDIT)).toBe(false);
  });

  it('denies a missing user', () => {
    expect(meetsAny(undefined, R.FIELD)).toBe(false);
    expect(hasConsoleAccess(undefined)).toBe(false);
  });
});

describe('built-in roles after the migration', () => {
  const cases: [keyof typeof ACCESS, keyof typeof R, boolean][] = [
    ['technician', 'FIELD', true],
    ['technician', 'OPS_VIEW', false],
    ['technician', 'STATUS_BOARD', true],
    ['technician', 'USERS_VIEW', false],
    ['technician', 'TICKET_INVENTORY_EDIT', true],
    ['technician', 'CONSUMPTION_EDIT', false],
    ['ceo', 'OPS_VIEW', true],
    ['ceo', 'DISPATCH_ASSIGN', false],
    ['ceo', 'PROVISIONING_LOG', true],
    ['ceo', 'FIELD', false],
    ['finance', 'FINANCE_REMIND', true],
    ['finance', 'PAYMENTS_REPORT', true],
    ['finance', 'MASTER_REPORT', false],
    ['finance', 'OPS_VIEW', false],
    ['supervisor', 'DISPATCH_ASSIGN', true],
    ['supervisor', 'AUTO_ASSIGN_EDIT', true],
    ['supervisor', 'ITEMS_EDIT', false],
    ['supervisor', 'USERS_EDIT', false],
    ['supervisor', 'STOCK_REQUESTS_VIEW', true],
    ['inventory', 'CONSUMPTION_EDIT', true],
    ['inventory', 'STOCK_REQUESTS_VIEW', true],
    ['inventory', 'ITEMS_EDIT', false],
    ['inventory', 'FIELD', false],
    ['admin', 'ROLES_MANAGE', true],
    ['supervisor', 'ROLES_MANAGE', false],
    ['admin', 'USERS_DELETE', true],
  ];

  it.each(cases)('%s on %s -> %s', (role, requirement, expected) => {
    expect(meetsAny(ACCESS[role], R[requirement] as never)).toBe(expected);
  });

  it('only gives ticket-wide visibility to console users', () => {
    expect(hasConsoleAccess(ACCESS.technician)).toBe(false);
    expect(hasConsoleAccess(ACCESS.finance)).toBe(true);
    expect(hasConsoleAccess(ACCESS.admin)).toBe(true);
  });
});

describe('normalizeRolePermissions', () => {
  it('rejects unknown screens and caps levels', () => {
    expect(() =>
      normalizeRolePermissions([{ screen: 'nope', level: 'VIEW' }]),
    ).toThrow(BadRequestException);
    expect(
      normalizeRolePermissions([
        { screen: 'payments', level: 'DELETE' },
        { screen: 'users', level: 'NONE' },
      ]),
    ).toEqual([{ screen: 'payments', level: 'VIEW' }]);
  });
});

describe('normalizeOverrides', () => {
  it('keeps only real differences on the role screens', () => {
    expect(
      normalizeOverrides(finance, [
        { screen: 'finance_overview', level: 'VIEW' },
        { screen: 'payments', level: 'NONE' },
        { screen: 'users', level: 'EDIT' },
      ]),
    ).toEqual([{ screen: 'payments', level: 'NONE' }]);
  });

  it('drops all overrides for full-access roles', () => {
    expect(
      normalizeOverrides({ ...finance, full_access: true }, [
        { screen: 'payments', level: 'NONE' },
      ]),
    ).toEqual([]);
  });
});
