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
    case LOGIN_SUCCESS: {
      const u = action.payload.user;
      const presenceOnline =
        u?.presence === 'ONLINE' ||
        (u?.presence == null && normalizeAvailability(u?.availability));
      return {
        isLoggedIn: true,
        isOnline: presenceOnline,
        user: u,
        token: action.payload.token,
        availabilityLockUntil: 0,
      };
    }
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
    case 'USER_PRESENCE': {
      const nextOnline = normalizeAvailability(action.payload.availability);
      const nextUser = action.payload.user
        ? action.payload.user
        : state.user
          ? {
              ...state.user,
              presence: action.payload.presence ?? state.user.presence,
              availability: nextOnline,
              busy_comment:
                action.payload.busy_comment !== undefined
                  ? action.payload.busy_comment
                  : state.user.busy_comment,
            }
          : state.user;
      return {
        ...state,
        isOnline: nextOnline,
        availabilityLockUntil: Date.now() + AVAILABILITY_LOCK_MS,
        user: nextUser,
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
