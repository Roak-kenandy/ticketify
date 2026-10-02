import {apiGet} from '../utils/apiClient';
import store from '../store/store';

/** Brief window to skip redundant list sync during an in-flight mutation */
const MUTATION_GRACE_MS = 3000;
/** Keep optimistic state until CRM confirms or this TTL expires */
const MAX_PENDING_MS = 5 * 60 * 1000;

const STATE_RANK: Record<string, number> = {
  NEW: 1,
  IN_PROGRESS: 2,
  CLOSED: 3,
};

let lastMutationAt = 0;
const pendingById = new Map<string, Record<string, unknown>>();

export function sameTicketId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

export function hasPendingTicketMutations(): boolean {
  return pendingById.size > 0;
}

function markPending(ticketId: string, patch: Record<string, unknown>) {
  lastMutationAt = Date.now();
  const key = String(ticketId);
  pendingById.set(key, {
    ...(pendingById.get(key) ?? {}),
    ...patch,
    _mutatedAt: Date.now(),
  });
}

function clearExpiredPending() {
  const now = Date.now();
  pendingById.forEach((patch, id) => {
    if (now - (patch._mutatedAt as number) >= MAX_PENDING_MS) {
      pendingById.delete(id);
    }
  });
}

function tryReleasePending(ticketId: string, serverTicket: any) {
  const pending = pendingById.get(ticketId);
  if (!pending) {
    return;
  }
  const expectedState = pending.state as string | undefined;
  if (expectedState && serverTicket?.state === expectedState) {
    pendingById.delete(ticketId);
    return;
  }
  if (Date.now() - (pending._mutatedAt as number) >= MAX_PENDING_MS) {
    pendingById.delete(ticketId);
  }
}

function shouldPreferLocalState(
  localState: string,
  serverState: string,
): boolean {
  return (STATE_RANK[localState] ?? 0) > (STATE_RANK[serverState] ?? 0);
}

function mergePendingIntoTicket(ticket: any): any {
  if (!ticket?.id) {
    return ticket;
  }
  const pending = pendingById.get(String(ticket.id));
  if (!pending) {
    return ticket;
  }
  const age = Date.now() - (pending._mutatedAt as number);
  if (age >= MAX_PENDING_MS) {
    pendingById.delete(String(ticket.id));
    return ticket;
  }
  return {...ticket, ...withoutMeta(pending)};
}

function withoutMeta(pending: Record<string, unknown>) {
  const rest = {...pending};
  delete rest._mutatedAt;
  return rest;
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
    return {...group, tickets: {...group.tickets, content: list}};
  }
  if (Array.isArray(group?.content)) {
    return {...group, content: list};
  }
  return group;
}

function mergeTicketFromServer(server: any, local?: any): any {
  const id = String(server?.id);
  tryReleasePending(id, server);
  const merged = mergePendingIntoTicket(server);
  const pending = pendingById.get(id);
  if (pending) {
    const age = Date.now() - (pending._mutatedAt as number);
    if (age < MAX_PENDING_MS) {
      return {...merged, ...withoutMeta(pending)};
    }
  }
  if (local && shouldPreferLocalState(local.state, merged.state)) {
    return {...merged, state: local.state, stage: local.stage ?? merged.stage};
  }
  return merged;
}

function mergeTicketListFromServer(incoming: any[], existing: any[]): any[] {
  const existingMap = new Map(existing.map(t => [String(t.id), t]));
  const seen = new Set<string>();
  const merged = incoming.map(t => {
    const id = String(t.id);
    seen.add(id);
    return mergeTicketFromServer(t, existingMap.get(id));
  });

  for (const [id, local] of existingMap) {
    if (seen.has(id)) {
      continue;
    }
    const pending = pendingById.get(id);
    if (pending || local.state === 'IN_PROGRESS' || local.state === 'CLOSED') {
      merged.push(mergePendingIntoTicket(local));
    }
  }

  return merged;
}

function mergeTeamTicketsFromServer(incoming: any[], existing: any[]): any[] {
  if (!Array.isArray(incoming)) {
    return incoming;
  }
  const existingMap = new Map<string, any>();
  for (const team of Array.isArray(existing) ? existing : []) {
    for (const ticket of teamTicketList(team)) {
      existingMap.set(String(ticket.id), ticket);
    }
  }
  return incoming.map(team =>
    withTeamTicketList(
      team,
      teamTicketList(team).map((ticket: any) =>
        mergeTicketFromServer(ticket, existingMap.get(String(ticket.id))),
      ),
    ),
  );
}

function normalizeServerTicket(ticketId: string, serverTicket?: any) {
  const id = String(ticketId);
  if (serverTicket?.id && sameTicketId(serverTicket.id, ticketId)) {
    return {...serverTicket, id};
  }
  return {id, ...(serverTicket ?? {})};
}

export async function fetchMyTickets(token: string) {
  const data = await apiGet('/tickets', token, {
    silent: true,
    timeoutMs: 30000,
  });
  return data?.content ?? [];
}

export async function fetchTeamTickets(token: string) {
  return apiGet('/tickets/teams', token, {silent: true, timeoutMs: 30000});
}

export async function fetchTicketById(token: string, ticketId: string) {
  const ticket = await apiGet(`/tickets/${ticketId}`, token);
  return mergePendingIntoTicket({...ticket, id: ticketId});
}

export async function syncAllTickets(
  dispatch: any,
  token: string,
  options?: {force?: boolean},
) {
  if (!token) {
    return;
  }
  if (!options?.force && Date.now() - lastMutationAt < MUTATION_GRACE_MS) {
    return;
  }

  clearExpiredPending();
  const existingTickets = store.getState().global.tickets ?? [];
  const existingTeamTickets = store.getState().global.team_tickets ?? [];

  const [myResult, teamResult] = await Promise.allSettled([
    fetchMyTickets(token),
    fetchTeamTickets(token),
  ]);

  let myTickets: any[] = [];
  let teamTickets: any[] = [];
  const errors: Error[] = [];

  if (myResult.status === 'fulfilled') {
    myTickets = myResult.value;
    dispatch({
      type: 'SET_TICKETS',
      payload: mergeTicketListFromServer(myTickets, existingTickets),
    });
  } else {
    errors.push(myResult.reason);
  }

  if (teamResult.status === 'fulfilled') {
    teamTickets = teamResult.value;
    dispatch({
      type: 'SET_TEAM_TICKETS',
      payload: mergeTeamTicketsFromServer(teamTickets, existingTeamTickets),
    });
  } else {
    errors.push(teamResult.reason);
  }

  dispatch({
    type: 'TICKETS_SYNC_STATUS',
    payload: {
      syncedAt: errors.length < 2 ? Date.now() : undefined,
      error:
        errors.length > 0
          ? errors[0]?.message || 'Could not load tickets'
          : null,
    },
  });

  if (errors.length === 2) {
    throw errors[0];
  }

  return {myTickets, teamTickets, partialFailure: errors.length > 0};
}

export function upsertTicket(dispatch: any, ticket: any) {
  if (!ticket?.id) {
    return;
  }
  dispatch({type: 'UPDATE_TICKET', payload: mergePendingIntoTicket(ticket)});
}

export function patchTicketState(
  dispatch: any,
  ticketId: string,
  state: string,
  extra: Record<string, unknown> = {},
) {
  dispatch({
    type: 'PATCH_TICKET',
    payload: {ticketId: String(ticketId), state, ...extra},
  });
}

async function reconcileTicket(dispatch: any, token: string, ticketId: string) {
  if (!pendingById.has(ticketId)) {
    return;
  }
  try {
    const raw = await apiGet(`/tickets/${ticketId}`, token);
    tryReleasePending(ticketId, raw);
    upsertTicket(dispatch, {...raw, id: ticketId});
    if (!pendingById.has(ticketId)) {
      await syncAllTickets(dispatch, token, {force: true});
    }
  } catch {
    // Keep pending patch until TTL or a later reconcile succeeds.
  }
}

function scheduleReconcile(dispatch: any, token: string, ticketId: string) {
  for (const delay of [15000, 45000, 90000]) {
    setTimeout(() => {
      reconcileTicket(dispatch, token, String(ticketId)).catch(() => {});
    }, delay);
  }
}

/**
 * Call after any ticket mutation succeeds.
 * 1. Records pending patch (survives stale list fetches)
 * 2. Updates Redux immediately with the known ticket id
 * 3. Re-fetches single ticket from API
 * 4. Reconciles with CRM until state matches
 */
export async function notifyTicketMutation(
  dispatch: any,
  token: string,
  ticketId: string,
  patch: Record<string, unknown>,
  serverTicket?: any,
): Promise<any> {
  const id = String(ticketId);
  markPending(id, patch);

  const base = normalizeServerTicket(id, serverTicket);
  const optimistic = {...base, ...patch, id};
  upsertTicket(dispatch, optimistic);

  let merged = optimistic;
  try {
    const fresh = await fetchTicketById(token, id);
    merged = {...fresh, ...patch, id};
    upsertTicket(dispatch, merged);
    tryReleasePending(id, fresh);
  } catch {
    const fallbackState = String(
      patch.state ?? optimistic.state ?? 'IN_PROGRESS',
    );
    patchTicketState(dispatch, id, fallbackState, patch);
  }

  scheduleReconcile(dispatch, token, id);

  return merged;
}

/** @deprecated use notifyTicketMutation */
export function applyTicketChange(dispatch: any, token: string, ticket: any) {
  notifyTicketMutation(dispatch, token, ticket.id, {}, ticket);
}

/** @deprecated use notifyTicketMutation */
export function applyTicketStateChange(
  dispatch: any,
  token: string,
  ticketId: string,
  state: string,
  ticket?: any,
) {
  notifyTicketMutation(
    dispatch,
    token,
    ticketId,
    {state},
    ticket?.id && sameTicketId(ticket.id, ticketId) ? ticket : undefined,
  );
}
