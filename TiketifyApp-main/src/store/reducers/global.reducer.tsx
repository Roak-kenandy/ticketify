import {ACTIVE_BOOKING, USER_DATA} from '../types/type';

const sameTicketId = (a: unknown, b: unknown) =>
  a != null && b != null && String(a) === String(b);

const patchTicketInList = (tickets: any[], payload: any) => {
  const {ticketId, state: ticketState, ...extra} = payload;
  return tickets.map((t: any) =>
    sameTicketId(t.id, ticketId)
      ? {...t, state: ticketState, ...extra}
      : t,
  );
};

const patchTicketInTeamLists = (teamTickets: any[], payload: any) => {
  const {ticketId, state: ticketState, ...extra} = payload;
  return teamTickets.map((team: any) => {
    if (!Array.isArray(team?.content)) {
      return team;
    }
    return {
      ...team,
      content: team.content.map((t: any) =>
        sameTicketId(t.id, ticketId)
          ? {...t, state: ticketState, ...extra}
          : t,
      ),
    };
  });
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

const upsertTicketInTeamLists = (teamTickets: any[], ticket: any) => {
  return teamTickets.map((team: any) => {
    if (!Array.isArray(team?.content)) {
      return team;
    }
    const index = team.content.findIndex((t: any) =>
      sameTicketId(t.id, ticket.id),
    );
    if (index === -1) {
      return team;
    }
    const content = [...team.content];
    content[index] = {...content[index], ...ticket};
    return {...team, content};
  });
};

const initialState = {
  active_booking: null,
  tickets: [],
  team_tickets: [],
  user_data: null,
};

const globalReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'SET_TICKETS':
      return {
        ...state,
        tickets: action.payload,
      };
    case 'SET_TEAM_TICKETS':
      return {
        ...state,
        team_tickets: action.payload,
      };
    case 'UPDATE_TICKET': {
      const ticket = action.payload;
      return {
        ...state,
        tickets: upsertTicketInList(state.tickets, ticket),
        team_tickets: upsertTicketInTeamLists(state.team_tickets, ticket),
      };
    }
    case 'PATCH_TICKET': {
      return {
        ...state,
        tickets: patchTicketInList(state.tickets, action.payload),
        team_tickets: patchTicketInTeamLists(state.team_tickets, action.payload),
      };
    }

    case ACTIVE_BOOKING:
      return {
        ...state,
        active_booking: action.payload,
      };
    case USER_DATA:
      return {
        ...state,
        user_data: action.payload,
      };
    default:
      return state;
  }
};

export default globalReducer;
