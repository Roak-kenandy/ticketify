import AsyncStorage from '@react-native-async-storage/async-storage';
import {OneSignal} from 'react-native-onesignal';
import {apiFetch} from './apiClient';
import {clearSession} from './secureSession';

export async function clearStoredSession(dispatch: (action: any) => void) {
  try {
    await clearSession();
  } catch {
    // Keychain can be unavailable (e.g. device lock changes); still log out.
  }
  try {
    // offline_locations belong to this user; never replay them under the next login.
    await AsyncStorage.multiRemove([
      'user',
      'token',
      'offline_locations',
      'background_proofs',
    ]);
  } catch {
    // Non-blocking
  }
  dispatch({type: 'LOGOUT'});
}

/**
 * Full sign-out: mark the technician offline (so dispatch stops assigning
 * work), revoke the token on the server, detach this device from their push
 * notifications, then clear the stored session. Network steps are best effort
 * and never block sign-out.
 */
export async function signOut(
  dispatch: (action: any) => void,
  token?: string | null,
) {
  if (token) {
    await apiFetch('/users/presence', token, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({presence: 'OFFLINE'}),
      timeoutMs: 4000,
      silent: true,
    }).catch(() => {});
    await apiFetch('/auth/logout', token, {
      method: 'POST',
      timeoutMs: 4000,
      silent: true,
    }).catch(() => {});
  }
  try {
    OneSignal.logout();
  } catch {
    // Push SDK not initialised; nothing to detach.
  }
  await clearStoredSession(dispatch);
}

let unauthorizedHandled = false;

/** Session-expired path: skip the presence call since the token is dead. */
export async function handleSessionExpired(dispatch: (action: any) => void) {
  if (unauthorizedHandled) {
    return;
  }
  unauthorizedHandled = true;
  try {
    try {
      OneSignal.logout();
    } catch {
      // ignore
    }
    await clearStoredSession(dispatch);
  } finally {
    setTimeout(() => {
      unauthorizedHandled = false;
    }, 2000);
  }
}
