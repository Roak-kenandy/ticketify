import {Platform} from 'react-native';
import {BASE_URL} from '@env';

// Android emulator reaches the host machine at 10.0.2.2 (not localhost).
const defaultLocalBaseUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3333/api/v1'
    : 'http://127.0.0.1:3333/api/v1';

const configuredBaseUrl =
  BASE_URL?.trim() || (__DEV__ ? defaultLocalBaseUrl : '');

// Release builds must only talk to the API over TLS; tokens and customer data
// would otherwise travel in clear text.
if (!__DEV__ && !/^https:\/\//i.test(configuredBaseUrl)) {
  throw new Error('BASE_URL must be an https:// URL for release builds');
}

export const API_BASE_URL = configuredBaseUrl;
