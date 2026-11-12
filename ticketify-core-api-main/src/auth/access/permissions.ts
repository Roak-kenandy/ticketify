import { BadRequestException } from '@nestjs/common';
import { AccessLevel } from '@prisma/client';
import { clampLevel, Level, screenDef } from './screens';

type Entry = { screen: string; level: AccessLevel };

/** Validates a role's screen list: known screens, one entry each, capped at each screen's maximum. */
export function normalizeRolePermissions(entries: Entry[] = []) {
  const out = new Map<string, Level>();
  for (const entry of entries) {
    if (!screenDef(entry.screen)) {
      throw new BadRequestException(`Unknown screen "${entry.screen}"`);
    }
    if (entry.level === 'NONE') continue;
    const level = clampLevel(entry.screen, entry.level);
    if (level) out.set(entry.screen, level);
  }
  return [...out].map(([screen, level]) => ({ screen, level }));
}

/**
 * Keeps only overrides that differ from the role's level for a screen the role
 * has. Full-access roles cannot be narrowed per user.
 */
export function normalizeOverrides(
  role: {
    full_access: boolean;
    permissions: { screen: string; level: string }[];
  },
  entries: Entry[] = [],
) {
  if (role.full_access) return [];
  const roleLevels = new Map(role.permissions.map((p) => [p.screen, p.level]));
  const out = new Map<string, AccessLevel>();
  for (const entry of entries) {
    if (!screenDef(entry.screen)) {
      throw new BadRequestException(`Unknown screen "${entry.screen}"`);
    }
    if (!roleLevels.has(entry.screen)) continue;
    const level =
      entry.level === 'NONE' ? 'NONE' : clampLevel(entry.screen, entry.level);
    if (level && level !== roleLevels.get(entry.screen)) {
      out.set(entry.screen, level);
    }
  }
  return [...out].map(([screen, level]) => ({ screen, level }));
}
