import {LOGIN_SUCCESS, LOGOUT} from '../types/type';
import {normalizeAvailability} from '../../utils/apiClient';

const AVAILABILITY_LOCK_MS = 8000;

export type AuthState = {
  isLoggedIn: boolean;
  isOnline: boolean;
  user: any;
  token: string | null;
  availabilityLockUntil: number;
};

const initialState: AuthState = {
  isLoggedIn: false,
  isOnline: false,
  user: null,
  token: null,
  availabilityLockUntil: 0,
};

/** Online or busy: the technician is working and should share location. */
export function isOnShift(auth: AuthState | undefined): boolean {
  if (!auth?.token) {
    return false;
  }
  const presence = auth.user?.presence;
  if (presence === 'ONLINE' || presence === 'BUSY') {
    return true;
  }
  if (presence === 'OFFLINE') {
    return false;
  }
  return auth.isOnline;
}

const authReducer = (
  state: AuthState = initialState,
  action: any,
): AuthState => {
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
      const incoming = action.payload.user ?? state.user;
      // While a presence change is settling, keep the local presence so a
      // stale profile fetch can't flip the status dots back.
      const nextUser =
        lockActive && state.user && incoming
          ? {
              ...incoming,
              presence: state.user.presence,
              busy_comment: state.user.busy_comment,
            }
          : incoming;
      if (
        state.user?.id === nextUser?.id &&
        state.isOnline === nextOnline &&
        state.user?.availability === nextUser?.availability &&
        state.user?.presence === nextUser?.presence &&
        state.user?.name === nextUser?.name
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
