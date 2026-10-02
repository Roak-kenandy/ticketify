import * as KeyChain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVICE = 'ticketify.auth';
const INSTALL_MARKER_KEY = 'ticketify.installed';

const OPTIONS: KeyChain.Options = {
  service: SERVICE,
  // Not synced to iCloud / other devices and unreadable while the phone is locked.
  accessible: KeyChain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type StoredSession = {token: string; user: any};

export async function saveSession(user: any, token: string): Promise<void> {
  await KeyChain.setGenericPassword(
    JSON.stringify(user ?? null),
    token,
    OPTIONS,
  );
}

export async function clearSession(): Promise<void> {
  await Promise.allSettled([
    KeyChain.resetGenericPassword({service: SERVICE}),
    // Sessions saved by older app versions used the default service.
    KeyChain.resetGenericPassword(),
  ]);
}

/**
 * iOS keeps keychain items after the app is deleted. On the first launch of a
 * fresh install, wipe anything left behind so a reinstalled (or resold) phone
 * never resumes the previous user's session.
 */
async function resetIfFreshInstall(): Promise<void> {
  const installed = await AsyncStorage.getItem(INSTALL_MARKER_KEY).catch(
    () => '1',
  );
  if (installed) {
    return;
  }
  await clearSession();
  await AsyncStorage.setItem(INSTALL_MARKER_KEY, '1').catch(() => {});
}

export async function loadSession(): Promise<StoredSession | null> {
  await resetIfFreshInstall();
  const credentials = await KeyChain.getGenericPassword({service: SERVICE});
  if (!credentials || !credentials.password) {
    // Drop any legacy (less protected) entry instead of migrating it; the API
    // no longer accepts tokens issued before the security upgrade anyway.
    await KeyChain.resetGenericPassword().catch(() => false);
    return null;
  }
  let user: any = null;
  try {
    user = JSON.parse(credentials.username);
  } catch {
    user = null;
  }
  return {token: credentials.password, user};
}
