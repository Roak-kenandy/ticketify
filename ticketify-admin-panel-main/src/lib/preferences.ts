import axiosInterceptorInstance from "./axios-interceptor";
import { AdminAuth } from "./admin-auth";

export type ThemePreference = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";
export type TextSize = "default" | "large";
export type StartPage = "map" | "operations" | "finance";

export type Preferences = {
  theme: ThemePreference;
  density: Density;
  textSize: TextSize;
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  startPage: StartPage;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  density: "comfortable",
  textSize: "default",
  reduceMotion: false,
  sidebarCollapsed: false,
  startPage: "map",
};

/** Mirrors the last applied preferences so the pre-paint script in the root layout avoids a flash. */
export const ACTIVE_PREFS_KEY = "ticketify.prefs.active";

const userKey = (userId: string) => `ticketify.prefs.${userId}`;

export function currentUserId(): string | null {
  return AdminAuth.getUserInfo()?.sub ?? null;
}

function normalize(value: unknown): Preferences {
  const stored = value && typeof value === "object" ? (value as Partial<Preferences>) : {};
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export function readCachedPreferences(userId: string | null): Preferences | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(userKey(userId));
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function cachePreferences(userId: string | null, prefs: Preferences) {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(prefs);
  if (userId) localStorage.setItem(userKey(userId), json);
  localStorage.setItem(ACTIVE_PREFS_KEY, json);
}

export function applyPreferences(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.density = prefs.density;
  root.dataset.textSize = prefs.textSize;
  root.classList.toggle("reduce-motion", prefs.reduceMotion);
}

export async function fetchPreferences(): Promise<Preferences> {
  const response = await axiosInterceptorInstance.get("/users/me/preferences", { timeout: 8_000 });
  return normalize(response.data);
}

export async function savePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const response = await axiosInterceptorInstance.patch("/users/me/preferences", patch);
  return normalize(response.data);
}

/** Loads the signed-in user's saved preferences into the local cache (used right after login). */
export async function primePreferences(): Promise<Preferences | null> {
  const userId = currentUserId();
  if (!userId) return null;
  try {
    const prefs = await fetchPreferences();
    cachePreferences(userId, prefs);
    return prefs;
  } catch {
    return readCachedPreferences(userId);
  }
}

/** Inline script run before paint: applies density / text size / motion from the last session. */
export const PREFERENCES_BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('${ACTIVE_PREFS_KEY}')||'null');if(p){var r=document.documentElement;r.dataset.density=p.density||'comfortable';r.dataset.textSize=p.textSize||'default';if(p.reduceMotion)r.classList.add('reduce-motion');}}catch(e){}`;
