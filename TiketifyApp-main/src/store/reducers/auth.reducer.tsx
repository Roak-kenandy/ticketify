import {LOGIN_SUCCESS, LOGOUT} from '../types/type';
import {normalizeAvailability} from '../../utils/apiClient';

const AVAILABILITY_LOCK_MS = 8000;

const initialState = {
  isLoggedIn: false,
  isOnline: false,
  user: null,
  token: null,
  availabilityLockUntil: 0,
};

const authReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case LOGIN_SUCCESS:
      return {
        isLoggedIn: true,
        isOnline: normalizeAvailability(action.payload.user?.availability),
        user: action.payload.user,
        token: action.payload.token,
        availabilityLockUntil: 0,
      };
    case LOGOUT:
      return {...initialState};
    case 'USER_STATUS': {
      const nextOnline = normalizeAvailability(action.payload);
      return {
        ...state,
        isOnline: nextOnline,
        availabilityLockUntil: Date.now() + AVAILABILITY_LOCK_MS,
        user: state.user
          ? {...state.user, availability: nextOnline}
          : state.user,
      };
    }
    case 'USER_PROFILE': {
      const lockActive = state.availabilityLockUntil > Date.now();
      const skipAvailability = action.payload.skipAvailability || lockActive;
      const nextOnline = skipAvailability
        ? state.isOnline
        : action.payload.availability !== undefined
          ? normalizeAvailability(action.payload.availability)
          : state.isOnline;
      const nextUser = action.payload.user ?? state.user;
      if (
        state.user?.id === nextUser?.id &&
        state.isOnline === nextOnline &&
        state.user?.availability === nextUser?.availability
      ) {
        return state;
      }
      return {
        ...state,
        user: nextUser,
        isOnline: nextOnline,
      };
    }
    default:
      return state;
  }
};

export default authReducer;
