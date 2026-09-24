import {Platform} from 'react-native';
import {BASE_URL} from '@env';

// Android emulator reaches the host machine at 10.0.2.2 (not localhost).
const defaultLocalBaseUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3333/api/v1'
    : 'http://127.0.0.1:3333/api/v1';

export const API_BASE_URL = BASE_URL?.trim() || defaultLocalBaseUrl;
