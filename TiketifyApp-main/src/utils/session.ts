import * as KeyChain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function clearStoredSession(dispatch: (action: any) => void) {
  await KeyChain.resetGenericPassword();
  await AsyncStorage.multiRemove(['user', 'token']);
  dispatch({type: 'LOGOUT'});
}
