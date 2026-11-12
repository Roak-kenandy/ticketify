"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVELS, levelRank, type Screen } from "@/lib/permissions";
import type { AccessLevel, PermissionEntry, ScreenDef } from "@/types/admin";

export type LevelMap = Partial<Record<Screen, AccessLevel>>;

const LEVEL_LABEL: Record<AccessLevel, string> = {
  NONE: "None",
  VIEW: "View",
  EDIT: "Edit",
  DELETE: "Delete",
};

export function toLevelMap(entries: PermissionEntry[] = []): LevelMap {
  return Object.fromEntries(entries.map((entry) => [entry.screen, entry.level]));
}

/** Screens with a level other than None, for saving a role. */
export function toEntries(levels: LevelMap): PermissionEntry[] {
  return (Object.entries(levels) as [Screen, AccessLevel][])
    .filter(([, level]) => level !== "NONE")
    .map(([screen, level]) => ({ screen, level }));
}

/** Only the levels that differ from the role, for saving a user's overrides. */
export function toOverrides(levels: LevelMap, baseline: LevelMap): PermissionEntry[] {
  return (Object.entries(levels) as [Screen, AccessLevel][])
    .filter(([screen, level]) => baseline[screen] && baseline[screen] !== level)
    .map(([screen, level]) => ({ screen, level }));
}

type Props = {
  screens: ScreenDef[];
  levels: LevelMap;
  onChange: (screen: Screen, level: AccessLevel) => void;
  /** Role levels: rows are limited to these screens and changes are marked. */
  baseline?: LevelMap;
  disabled?: boolean;
};

export function ScreenAccessEditor({ screens, levels, onChange, baseline, disabled }: Props) {
  const rows = baseline ? screens.filter((screen) => baseline[screen.key]) : screens;
  const groups = rows.reduce<Record<string, ScreenDef[]>>((acc, screen) => {
    (acc[screen.group] ??= []).push(screen);
    return acc;
  }, {});

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        This role has no screens yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([group, items]) => (
        <section key={group} aria-label={group}>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </h4>
          <ul className="divide-y rounded-lg border">
            {items.map((screen) => {
              const level = levels[screen.key] ?? "NONE";
              const roleLevel = baseline?.[screen.key];
              const changed = Boolean(roleLevel && roleLevel !== level);
              const options: AccessLevel[] = [
                "NONE",
                ...LEVELS.filter((option) => levelRank(option) <= levelRank(screen.max)),
              ];
              return (
                <li
                  key={screen.key}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {screen.label}
                      {changed && (
                        <span className="rounded bg-warning/15 px-1.5 text-[11px] font-semibold text-warning">
                          Role: {LEVEL_LABEL[roleLevel!]}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {level === "NONE" ? "No access" : screen.levels[level]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {changed && !disabled && (
                      <button
                        type="button"
                        onClick={() => onChange(screen.key, roleLevel!)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Reset ${screen.label} to the role level`}
                        title="Reset to role level"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div
                      role="radiogroup"
                      aria-label={`${screen.label} access`}
                      className="inline-flex rounded-md border bg-muted/40 p-0.5"
                    >
                      {options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={level === option}
                          disabled={disabled}
                          onClick={() => onChange(screen.key, option)}
                          className={cn(
                            "min-w-[52px] rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            level === option
                              ? option === "NONE"
                                ? "bg-card text-foreground shadow-sm"
                                : "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {LEVEL_LABEL[option]}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
