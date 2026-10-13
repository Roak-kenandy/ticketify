"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { AdminAuth } from "@/lib/admin-auth";
import { getAuthToken, setAuthToken } from "@/lib/auth-sync";
import { apiPatch, apiPost, isTokenExpired, subscribeUnauthorized } from "./api";
import { showError } from "./notify";

/** Same storage as the operations console, so one sign-in serves every role. */
const TOKEN_KEY = "access_token";
const USER_KEY = "user";
export const LOGIN_PATH = "/auth/login";

type SessionValue = {
  /** False until the stored session has been read on the client. */
  ready: boolean;
  token: string | null;
  user: any;
  signIn: (token: string, user: any) => void;
  updateUser: (patch: Record<string, unknown> | ((user: any) => any)) => void;
  setToken: (token: string) => void;
  signOut: () => Promise<void>;
};

const SessionContext = React.createContext<SessionValue | null>(null);

function readStored(): { token: string; user: any } | null {
  try {
    const token = getAuthToken();
    const raw = window.localStorage.getItem(USER_KEY);
    if (!token || !raw) {
      return null;
    }
    const user = JSON.parse(raw);
    if (!user) {
      return null;
    }
    return isTokenExpired(token) ? null : { token, user };
  } catch {
    return null;
  }
}

function writeStored(token: string | null, user: any) {
  try {
    if (token && user) {
      setAuthToken(token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      AdminAuth.clearSession();
    }
  } catch {
    // Private mode / storage full: the session still works for this tab.
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [token, setTokenState] = React.useState<string | null>(null);
  const [user, setUser] = React.useState<any>(null);
  const tokenRef = React.useRef<string | null>(null);
  tokenRef.current = token;

  React.useEffect(() => {
    const stored = readStored();
    if (stored) {
      setTokenState(stored.token);
      setUser(stored.user);
    } else {
      writeStored(null, null);
    }
    setReady(true);
  }, []);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TOKEN_KEY && event.key !== USER_KEY) {
        return;
      }
      const stored = readStored();
      setTokenState(stored?.token ?? null);
      setUser(stored?.user ?? null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const clear = React.useCallback(() => {
    writeStored(null, null);
    setTokenState(null);
    setUser(null);
  }, []);

  React.useEffect(
    () =>
      subscribeUnauthorized(() => {
        if (!tokenRef.current) {
          return;
        }
        clear();
        showError("Your session has expired. Please sign in again.");
        router.replace(LOGIN_PATH);
      }),
    [clear, router],
  );

  React.useEffect(() => {
    if (!token) {
      return;
    }
    // setTimeout overflows above ~24.8 days; tokens are far shorter than that.
    const delay = Math.min(AdminAuth.msUntilExpiry(token), 2_147_483_647);
    const timer = window.setTimeout(() => {
      clear();
      showError("Your session has expired. Please sign in again.");
      router.replace(LOGIN_PATH);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [token, clear, router]);

  const signIn = React.useCallback((nextToken: string, nextUser: any) => {
    writeStored(nextToken, nextUser);
    setTokenState(nextToken);
    setUser(nextUser);
  }, []);

  const updateUser = React.useCallback<SessionValue["updateUser"]>((patch) => {
    setUser((current: any) => {
      const next =
        typeof patch === "function" ? patch(current) : { ...current, ...patch };
      if (tokenRef.current) {
        writeStored(tokenRef.current, next);
      }
      return next;
    });
  }, []);

  const setToken = React.useCallback((nextToken: string) => {
    setTokenState(nextToken);
    setUser((current: any) => {
      writeStored(nextToken, current);
      return current;
    });
  }, []);

  const signOut = React.useCallback(async () => {
    const current = tokenRef.current;
    if (current) {
      // Presence first: logout revokes the token.
      await apiPatch("/users/presence", { presence: "OFFLINE" }, current, {
        silent: true,
        timeoutMs: 8000,
      }).catch(() => {});
      await apiPost("/auth/logout", {}, current, {
        silent: true,
        timeoutMs: 8000,
      }).catch(() => {});
    }
    clear();
    router.replace(LOGIN_PATH);
  }, [clear, router]);

  const value = React.useMemo(
    () => ({ ready, token, user, signIn, updateUser, setToken, signOut }),
    [ready, token, user, signIn, updateUser, setToken, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}
