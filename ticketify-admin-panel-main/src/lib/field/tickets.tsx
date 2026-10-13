"use client";

import React from "react";
import { apiGet } from "./api";
import { showInfo } from "./notify";
import { useSession } from "./session";

/** Brief window to skip redundant list sync during an in-flight mutation. */
const MUTATION_GRACE_MS = 3000;
/** Keep optimistic state until the CRM confirms or this TTL expires. */
const MAX_PENDING_MS = 5 * 60 * 1000;
/** Background refresh interval (the mobile app used push for this). */
const POLL_MS = 60 * 1000;

const STATE_RANK: Record<string, number> = { NEW: 1, IN_PROGRESS: 2, CLOSED: 3 };

type Pending = Record<string, unknown> & { _mutatedAt: number };

export function sameTicketId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

/** `/tickets/teams` returns `[{team, tickets: {content: [...]}}]`. */
export function teamTicketList(group: any): any[] {
  if (Array.isArray(group?.tickets?.content)) {
    return group.tickets.content;
  }
  if (Array.isArray(group?.content)) {
    return group.content;
  }
  return [];
}

function withTeamTicketList(group: any, list: any[]): any {
  if (Array.isArray(group?.tickets?.content)) {
    return { ...group, tickets: { ...group.tickets, content: list } };
  }
  if (Array.isArray(group?.content)) {
    return { ...group, content: list };
  }
  return group;
}

function withoutMeta(pending: Pending) {
  const rest: Record<string, unknown> = { ...pending };
  delete rest._mutatedAt;
  return rest;
}

function upsertInList(list: any[], ticket: any) {
  const index = list.findIndex((t) => sameTicketId(t.id, ticket.id));
  if (index === -1) {
    return [ticket, ...list];
  }
  const next = [...list];
  next[index] = { ...next[index], ...ticket };
  return next;
}

function updateExistingInList(list: any[], ticket: any) {
  const index = list.findIndex((t) => sameTicketId(t.id, ticket.id));
  if (index === -1) {
    return list;
  }
  const next = [...list];
  next[index] = { ...next[index], ...ticket };
  return next;
}

type TicketsValue = {
  tickets: any[];
  teamTickets: any[];
  syncedAt: number | null;
  error: string | null;
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /** Call after any ticket mutation succeeds; returns the merged ticket. */
  notifyTicketMutation: (
    ticketId: string,
    patch: Record<string, unknown>,
    serverTicket?: any,
  ) => Promise<any>;
};

const TicketsContext = React.createContext<TicketsValue | null>(null);

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const [tickets, setTickets] = React.useState<any[]>([]);
  const [teamTickets, setTeamTickets] = React.useState<any[]>([]);
  const [syncedAt, setSyncedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const ticketsRef = React.useRef(tickets);
  ticketsRef.current = tickets;
  const teamRef = React.useRef(teamTickets);
  teamRef.current = teamTickets;
  const pendingById = React.useRef(new Map<string, Pending>());
  const lastMutationAt = React.useRef(0);
  const knownNewIds = React.useRef<Set<string> | null>(null);

  const mergePending = React.useCallback((ticket: any) => {
    if (!ticket?.id) {
      return ticket;
    }
    const key = String(ticket.id);
    const pending = pendingById.current.get(key);
    if (!pending) {
      return ticket;
    }
    if (Date.now() - pending._mutatedAt >= MAX_PENDING_MS) {
      pendingById.current.delete(key);
      return ticket;
    }
    return { ...ticket, ...withoutMeta(pending) };
  }, []);

  const tryRelease = React.useCallback((ticketId: string, serverTicket: any) => {
    const pending = pendingById.current.get(ticketId);
    if (!pending) {
      return;
    }
    const expected = pending.state as string | undefined;
    if (
      (expected && serverTicket?.state === expected) ||
      Date.now() - pending._mutatedAt >= MAX_PENDING_MS
    ) {
      pendingById.current.delete(ticketId);
    }
  }, []);

  const mergeFromServer = React.useCallback(
    (server: any, local?: any) => {
      tryRelease(String(server?.id), server);
      const merged = mergePending(server);
      if (
        local &&
        !pendingById.current.has(String(server?.id)) &&
        (STATE_RANK[local.state] ?? 0) > (STATE_RANK[merged.state] ?? 0)
      ) {
        return { ...merged, state: local.state, stage: local.stage ?? merged.stage };
      }
      return merged;
    },
    [mergePending, tryRelease],
  );

  const upsertTicket = React.useCallback(
    (ticket: any) => {
      if (!ticket?.id) {
        return;
      }
      const merged = mergePending(ticket);
      setTickets((list) => upsertInList(list, merged));
      setTeamTickets((groups) =>
        groups.map((group) =>
          withTeamTicketList(group, updateExistingInList(teamTicketList(group), merged)),
        ),
      );
    },
    [mergePending],
  );

  const refresh = React.useCallback(
    async (options?: { force?: boolean }) => {
      if (!token) {
        return;
      }
      if (!options?.force && Date.now() - lastMutationAt.current < MUTATION_GRACE_MS) {
        return;
      }
      pendingById.current.forEach((pending, id) => {
        if (Date.now() - pending._mutatedAt >= MAX_PENDING_MS) {
          pendingById.current.delete(id);
        }
      });

      const [mine, teams] = await Promise.allSettled([
        apiGet("/tickets", token, { silent: true, timeoutMs: 30000 }),
        apiGet("/tickets/teams", token, { silent: true, timeoutMs: 30000 }),
      ]);
      const errors: Error[] = [];

      if (mine.status === "fulfilled") {
        const incoming: any[] = mine.value?.content ?? [];
        const existing = new Map(ticketsRef.current.map((t) => [String(t.id), t]));
        const seen = new Set<string>();
        const merged = incoming.map((t) => {
          seen.add(String(t.id));
          return mergeFromServer(t, existing.get(String(t.id)));
        });
        existing.forEach((local, id) => {
          if (
            !seen.has(id) &&
            (pendingById.current.has(id) ||
              local.state === "IN_PROGRESS" ||
              local.state === "CLOSED")
          ) {
            merged.push(mergePending(local));
          }
        });

        const newIds = new Set(
          merged.filter((t) => t.state === "NEW").map((t) => String(t.id)),
        );
        if (knownNewIds.current) {
          const fresh = merged.filter(
            (t) => t.state === "NEW" && !knownNewIds.current?.has(String(t.id)),
          );
          if (fresh.length) {
            notifyAssigned(fresh);
          }
        }
        knownNewIds.current = newIds;
        setTickets(merged);
      } else {
        errors.push(mine.reason);
      }

      if (teams.status === "fulfilled" && Array.isArray(teams.value)) {
        const existing = new Map<string, any>();
        teamRef.current.forEach((group) =>
          teamTicketList(group).forEach((t) => existing.set(String(t.id), t)),
        );
        setTeamTickets(
          teams.value.map((group: any) =>
            withTeamTicketList(
              group,
              teamTicketList(group).map((t) => mergeFromServer(t, existing.get(String(t.id)))),
            ),
          ),
        );
      } else if (teams.status === "rejected") {
        errors.push(teams.reason);
      }

      if (errors.length < 2) {
        setSyncedAt(Date.now());
      }
      setError(errors.length ? errors[0]?.message || "Could not load tickets" : null);
      if (errors.length === 2) {
        throw errors[0];
      }
    },
    [token, mergeFromServer, mergePending],
  );

  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  const reconcile = React.useCallback(
    async (ticketId: string) => {
      if (!token || !pendingById.current.has(ticketId)) {
        return;
      }
      try {
        const raw = await apiGet(`/tickets/${ticketId}`, token, { silent: true });
        tryRelease(ticketId, raw);
        upsertTicket({ ...raw, id: ticketId });
        if (!pendingById.current.has(ticketId)) {
          await refreshRef.current({ force: true });
        }
      } catch {
        // Keep the pending patch until TTL or a later reconcile succeeds.
      }
    },
    [token, tryRelease, upsertTicket],
  );

  const notifyTicketMutation = React.useCallback<TicketsValue["notifyTicketMutation"]>(
    async (ticketId, patch, serverTicket) => {
      const id = String(ticketId);
      lastMutationAt.current = Date.now();
      pendingById.current.set(id, {
        ...(pendingById.current.get(id) ?? {}),
        ...patch,
        _mutatedAt: Date.now(),
      });

      const base =
        serverTicket?.id && sameTicketId(serverTicket.id, id)
          ? { ...serverTicket, id }
          : { id, ...(serverTicket ?? {}) };
      const optimistic = { ...base, ...patch, id };
      upsertTicket(optimistic);

      let merged = optimistic;
      try {
        const fresh = mergePending({
          ...(await apiGet(`/tickets/${id}`, token, { silent: true })),
          id,
        });
        merged = { ...fresh, ...patch, id };
        upsertTicket(merged);
        tryRelease(id, fresh);
      } catch {
        // The optimistic patch above already reflects the change.
      }

      for (const delay of [15000, 45000, 90000]) {
        window.setTimeout(() => {
          reconcile(id).catch(() => {});
        }, delay);
      }
      return merged;
    },
    [token, upsertTicket, mergePending, tryRelease, reconcile],
  );

  React.useEffect(() => {
    if (!token) {
      setTickets([]);
      setTeamTickets([]);
      setSyncedAt(null);
      setError(null);
      knownNewIds.current = null;
      pendingById.current.clear();
      return;
    }
    refreshRef.current({ force: true }).catch(() => {});
    // Keeps polling in a background tab too (browsers throttle it to about once a
    // minute) so new assignments can still raise a desktop notification.
    const id = window.setInterval(() => {
      refreshRef.current().catch(() => {});
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshRef.current().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const value = React.useMemo(
    () => ({ tickets, teamTickets, syncedAt, error, refresh, notifyTicketMutation }),
    [tickets, teamTickets, syncedAt, error, refresh, notifyTicketMutation],
  );

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>;
}

function notifyAssigned(fresh: any[]) {
  const text =
    fresh.length === 1
      ? `New ticket assigned: #${fresh[0].number ?? fresh[0].id}`
      : `${fresh.length} new tickets assigned`;
  showInfo(text);
  try {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      new Notification("Ticketify", { body: text, icon: "/logo.png" });
    }
  } catch {
    // Notifications are a convenience only.
  }
}

export function useTickets() {
  const value = React.useContext(TicketsContext);
  if (!value) {
    throw new Error("useTickets must be used inside TicketsProvider");
  }
  return value;
}
