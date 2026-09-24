import {useCallback, useEffect, useRef} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useFocusEffect} from '@react-navigation/native';
import {apiGet, normalizeAvailability} from '../utils/apiClient';
import {
  hasPendingTicketMutations,
  syncAllTickets,
} from '../services/ticketsSync';
import {clearStoredSession} from '../utils/session';

const SYNC_COOLDOWN_MS = 45000;

let lastGlobalSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

type RefreshOptions = {
  silent?: boolean;
  force?: boolean;
};

export function useAppData(screenKey: string) {
  const dispatch = useDispatch();
  const token = useSelector((state: any) => state.auth?.token);
  const mountedRef = useRef(true);

  const handleUnauthorized = useCallback(async () => {
    await clearStoredSession(dispatch);
  }, [dispatch]);

  const refreshAllData = useCallback(
    async (options?: RefreshOptions) => {
      if (!token) {
        return;
      }

      const force = options?.force === true;
      const now = Date.now();
      const hasPendingMutations = hasPendingTicketMutations();
      if (
        !force &&
        !hasPendingMutations &&
        now - lastGlobalSyncAt < SYNC_COOLDOWN_MS
      ) {
        return;
      }

      if (syncInFlight) {
        return syncInFlight;
      }

      syncInFlight = (async () => {
        try {
          const profilePromise = apiGet('/users/me', token)
            .then(data => {
              if (!mountedRef.current) {
                return;
              }
              dispatch({
                type: 'USER_PROFILE',
                payload: {
                  user: data,
                  availability: normalizeAvailability(data?.availability),
                  skipAvailability: true,
                },
              });
              dispatch({type: 'USER_DATA', payload: data});
            })
            .catch((error: any) => {
              if (error?.status === 401) {
                return handleUnauthorized();
              }
              if (!options?.silent) {
                throw error;
              }
            });

          const ticketsPromise = syncAllTickets(dispatch, token, {
            force,
          }).catch((error: any) => {
            if (error?.status === 401) {
              return handleUnauthorized();
            }
            if (!options?.silent) {
              throw error;
            }
          });

          await Promise.all([profilePromise, ticketsPromise]);
          lastGlobalSyncAt = Date.now();
        } finally {
          syncInFlight = null;
        }
      })();

      return syncInFlight;
    },
    [dispatch, handleUnauthorized, token],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (screenKey === 'bootstrap' && token) {
      refreshAllData({silent: true, force: true}).catch(() => {});
    }
    return () => {
      mountedRef.current = false;
    };
  }, [refreshAllData, screenKey, token]);

  useFocusEffect(
    useCallback(() => {
      if (screenKey === 'home' && token) {
        refreshAllData({silent: true}).catch(() => {});
      }
    }, [refreshAllData, screenKey, token]),
  );

  return {refreshAllData, token};
}
