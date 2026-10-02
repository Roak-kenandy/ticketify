import {ACTIVE_BOOKING, USER_DATA} from '../types/type';

type GlobalState = {
  active_booking: any;
  tickets: any[];
  team_tickets: any[];
  user_data: any;
  /** Last successful ticket sync; null until the first one finishes. */
  tickets_synced_at: number | null;
  tickets_error: string | null;
};

const sameTicketId = (a: unknown, b: unknown) =>
  a != null && b != null && String(a) === String(b);

/** Team groups come back as `{team, tickets: {content}}`; older code used `{content}`. */
const mapTeamList = (group: any, fn: (list: any[]) => any[]) => {
  if (Array.isArray(group?.tickets?.content)) {
    return {
      ...group,
      tickets: {...group.tickets, content: fn(group.tickets.content)},
    };
  }
  if (Array.isArray(group?.content)) {
    return {...group, content: fn(group.content)};
  }
  return group;
};

const patchTicketInList = (tickets: any[], payload: any) => {
  const {ticketId, state: ticketState, ...extra} = payload;
  return tickets.map((t: any) =>
    sameTicketId(t.id, ticketId) ? {...t, state: ticketState, ...extra} : t,
  );
};

const upsertTicketInList = (tickets: any[], ticket: any) => {
  const index = tickets.findIndex((t: any) => sameTicketId(t.id, ticket.id));
  if (index === -1) {
    return [ticket, ...tickets];
  }
  const next = [...tickets];
  next[index] = {...next[index], ...ticket};
  return next;
};

const updateExistingInList = (tickets: any[], ticket: any) => {
  const index = tickets.findIndex((t: any) => sameTicketId(t.id, ticket.id));
  if (index === -1) {
    return tickets;
  }
  const next = [...tickets];
  next[index] = {...next[index], ...ticket};
  return next;
};

const initialState: GlobalState = {
  active_booking: null,
  tickets: [],
  team_tickets: [],
  user_data: null,
  tickets_synced_at: null,
  tickets_error: null,
};

const globalReducer = (
  state: GlobalState = initialState,
  action: any,
): GlobalState => {
  switch (action.type) {
    case 'SET_TICKETS':
      return {
        ...state,
        tickets: Array.isArray(action.payload) ? action.payload : [],
      };
    case 'SET_TEAM_TICKETS':
      return {
        ...state,
        team_tickets: Array.isArray(action.payload) ? action.payload : [],
      };
    case 'TICKETS_SYNC_STATUS':
      return {
        ...state,
        tickets_synced_at: action.payload?.syncedAt ?? state.tickets_synced_at,
        tickets_error: action.payload?.error ?? null,
      };
    case 'UPDATE_TICKET': {
      const ticket = action.payload;
      return {
        ...state,
        tickets: upsertTicketInList(state.tickets, ticket),
        team_tickets: state.team_tickets.map(group =>
          mapTeamList(group, list => updateExistingInList(list, ticket)),
        ),
      };
    }
    case 'PATCH_TICKET':
      return {
        ...state,
        tickets: patchTicketInList(state.tickets, action.payload),
        team_tickets: state.team_tickets.map(group =>
          mapTeamList(group, list => patchTicketInList(list, action.payload)),
        ),
      };
    case ACTIVE_BOOKING:
      return {...state, active_booking: action.payload};
    case USER_DATA:
      return {...state, user_data: action.payload};
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
};

export default globalReducer;
