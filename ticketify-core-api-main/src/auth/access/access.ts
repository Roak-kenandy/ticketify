import { Reflector } from '@nestjs/core';
import {
  clampLevel,
  Level,
  levelRank,
  Screen,
  screenDef,
  SCREENS,
} from './screens';

export type Capability = 'field_technician' | 'stock_holder' | 'store';

/** Effective access of a signed-in user: role defaults with their overrides applied. */
export type UserAccess = {
  full: boolean;
  field_technician: boolean;
  stock_holder: boolean;
  store: boolean;
  permissions: Partial<Record<Screen, Level>>;
};

export const NO_ACCESS: UserAccess = {
  full: false,
  field_technician: false,
  stock_holder: false,
  store: false,
  permissions: {},
};

/**
 * One way to be allowed through. A screen requirement can also demand a
 * capability (e.g. stock EDIT and being the store).
 */
export type Requirement =
  | { screen: Screen; level: Level; capability?: Capability }
  | { capability: Capability }
  | { full: true };

/** Route metadata: the request passes if any requirement is met. */
export const Access = Reflector.createDecorator<Requirement[]>();

export const view = (screen: Screen): Requirement => ({
  screen,
  level: 'VIEW',
});
export const edit = (screen: Screen): Requirement => ({
  screen,
  level: 'EDIT',
});
export const remove = (screen: Screen): Requirement => ({
  screen,
  level: 'DELETE',
});
export const FULL_ACCESS: Requirement = { full: true };

type RoleAccessRow = {
  full_access: boolean;
  field_technician: boolean;
  stock_holder: boolean;
  store: boolean;
  permissions: { screen: string; level: string }[];
};

/**
 * Overrides only change screens the role already has: a user can be raised
 * (up to the screen's maximum) or lowered, including to NONE, but never given
 * a screen their role does not include.
 */
export function resolveAccess(
  role: RoleAccessRow,
  overrides: { screen: string; level: string }[] = [],
): UserAccess {
  if (role.full_access) {
    const permissions: Partial<Record<Screen, Level>> = {};
    for (const screen of SCREENS) permissions[screen.key] = screen.max;
    return {
      full: true,
      field_technician: role.field_technician,
      stock_holder: role.stock_holder,
      store: true,
      permissions,
    };
  }
  const permissions: Partial<Record<Screen, Level>> = {};
  for (const row of role.permissions) {
    const level =
      row.level === 'NONE' ? null : clampLevel(row.screen, row.level as Level);
    if (level) permissions[row.screen as Screen] = level;
  }
  for (const row of overrides) {
    if (!(row.screen in permissions)) continue;
    if (row.level === 'NONE') {
      delete permissions[row.screen as Screen];
      continue;
    }
    const level = clampLevel(row.screen, row.level as Level);
    if (level) permissions[row.screen as Screen] = level;
  }
  return {
    full: false,
    field_technician: role.field_technician,
    stock_holder: role.stock_holder,
    store: role.store,
    permissions,
  };
}

export function can(
  access: UserAccess | null | undefined,
  screen: Screen,
  level: Level = 'VIEW',
): boolean {
  if (!access) return false;
  if (access.full) return true;
  return levelRank(access.permissions[screen]) >= levelRank(level);
}

export function hasCapability(
  access: UserAccess | null | undefined,
  capability: Capability,
): boolean {
  return Boolean(access?.[capability]);
}

export function meets(
  access: UserAccess | null | undefined,
  requirement: Requirement,
): boolean {
  if (!access) return false;
  if ('full' in requirement) return access.full;
  if ('screen' in requirement) {
    return (
      can(access, requirement.screen, requirement.level) &&
      (!requirement.capability || hasCapability(access, requirement.capability))
    );
  }
  return hasCapability(access, requirement.capability);
}

export function meetsAny(
  access: UserAccess | null | undefined,
  requirements: readonly Requirement[],
): boolean {
  return requirements.some((requirement) => meets(access, requirement));
}

/** Any console screen at all (everything except the technician app). */
export function hasConsoleAccess(
  access: UserAccess | null | undefined,
): boolean {
  if (!access) return false;
  if (access.full) return true;
  return Object.keys(access.permissions).some(
    (key) => key !== 'technician_app',
  );
}

/** Allowed to sign in: at least one screen, or full access. */
export function canSignIn(access: UserAccess | null | undefined): boolean {
  return Boolean(
    access && (access.full || Object.keys(access.permissions).length),
  );
}

export function isKnownScreen(key: string): key is Screen {
  return Boolean(screenDef(key));
}
