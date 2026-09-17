import {ACTIVE_BOOKING, USER_DATA} from '../types/type';

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

// export initial state
