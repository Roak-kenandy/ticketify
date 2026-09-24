import Snackbar from 'react-native-snackbar';
import colors from '../constants/colors';

type NotifyOptions = {
  duration?: number;
};

export function showError(message: string, options?: NotifyOptions) {
  if (!message?.trim()) {
    return;
  }
  Snackbar.show({
    text: message,
    duration: options?.duration ?? Snackbar.LENGTH_SHORT,
    backgroundColor: colors.error,
    textColor: colors.white,
  });
}

export function showSuccess(message: string, options?: NotifyOptions) {
  if (!message?.trim()) {
    return;
  }
  Snackbar.show({
    text: message,
    duration: options?.duration ?? Snackbar.LENGTH_SHORT,
    backgroundColor: colors.success,
    textColor: colors.white,
  });
}

export function showInfo(message: string, options?: NotifyOptions) {
  if (!message?.trim()) {
    return;
  }
  Snackbar.show({
    text: message,
    duration: options?.duration ?? Snackbar.LENGTH_SHORT,
    backgroundColor: colors.primary,
    textColor: colors.white,
  });
}
