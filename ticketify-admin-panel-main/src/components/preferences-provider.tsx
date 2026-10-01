"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  DEFAULT_PREFERENCES,
  applyPreferences,
  cachePreferences,
  currentUserId,
  fetchPreferences,
  readCachedPreferences,
  savePreferences,
  type Preferences,
} from "@/lib/preferences";

export type SyncStatus = "idle" | "saving" | "saved" | "error" | "offline";

type PreferencesContextValue = {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
  status: SyncStatus;
  /** True once the signed-in user's saved preferences have been loaded. */
  synced: boolean;
};

const PreferencesContext = React.createContext<PreferencesContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 400;

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [preferences, setPreferences] = React.useState<Preferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = React.useState<SyncStatus>("idle");
  const [synced, setSynced] = React.useState(false);
  const loadedFor = React.useRef<string | null | undefined>(undefined);
  const pending = React.useRef<Partial<Preferences>>({});
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeRef = React.useRef(theme);
  themeRef.current = theme;

  const commit = React.useCallback(
    (next: Preferences) => {
      setPreferences(next);
      applyPreferences(next);
      cachePreferences(currentUserId(), next);
      if (themeRef.current !== next.theme) setTheme(next.theme);
    },
    [setTheme],
  );

  React.useEffect(() => {
    const userId = currentUserId();
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    setSynced(false);

    const cached = readCachedPreferences(userId);
    if (cached) commit(cached);
    if (!userId) return;

    let cancelled = false;
    fetchPreferences()
      .then((server) => {
        if (cancelled) return;
        const neverSaved =
          !cached && JSON.stringify(server) === JSON.stringify(DEFAULT_PREFERENCES);
        const localTheme = themeRef.current;
        if (neverSaved && localTheme && localTheme !== server.theme) {
          const migrated = { ...server, theme: localTheme as Preferences["theme"] };
          commit(migrated);
          savePreferences({ theme: migrated.theme }).catch(() => undefined);
        } else {
          commit({ ...server, ...pending.current });
        }
        setSynced(true);
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, commit]);

  const flush = React.useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length || !currentUserId()) return;
    setStatus("saving");
    try {
      await savePreferences(patch);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, []);

  const update = React.useCallback(
    (patch: Partial<Preferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        applyPreferences(next);
        cachePreferences(currentUserId(), next);
        if (patch.theme && themeRef.current !== patch.theme) setTheme(patch.theme);
        return next;
      });
      pending.current = { ...pending.current, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, setTheme],
  );

  const reset = React.useCallback(() => update(DEFAULT_PREFERENCES), [update]);

  React.useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const value = React.useMemo(
    () => ({ preferences, update, reset, status, synced }),
    [preferences, update, reset, status, synced],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = React.useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}
