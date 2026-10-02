import React, {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';
import {AppState, AppStateStatus, Alert, Platform} from 'react-native';
import BackgroundLocationService from '../services/BackgroundLocationService';
import NativeBackgroundLocationService from '../services/NativeBackgroundLocationService';
import {useLocationPermissions} from '../hooks/useLocationPermissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL} from '../config/api';
import {isOnShift} from '../store/reducers/auth.reducer';

const BATTERY_ALERT_KEY = 'battery_alert_shown_v1';

const BackgroundLocationManager: React.FC = () => {
  const isOnline = useSelector((state: any) => isOnShift(state.auth));
  const token = useSelector((state: any) => state.auth?.token);
  const {permissionStatus, requestLocationPermission, refreshPermissionStatus} =
    useLocationPermissions();
  const hasShownBatteryAlert = useRef(false);
  const activeConfigRef = useRef('');
  const hasPromptedRef = useRef(false);
  const requestPermissionRef = useRef(requestLocationPermission);
  const refreshPermissionRef = useRef(refreshPermissionStatus);

  requestPermissionRef.current = requestLocationPermission;
  refreshPermissionRef.current = refreshPermissionStatus;

  useEffect(() => {
    if (
      isOnline &&
      token &&
      !hasPromptedRef.current &&
      (permissionStatus.status === 'denied' ||
        permissionStatus.status === 'blocked')
    ) {
      hasPromptedRef.current = true;
      requestPermissionRef.current().catch(() => {});
    }
  }, [isOnline, token, permissionStatus.status]);

  const showBatteryOptimizationAlert = async () => {
    if (hasShownBatteryAlert.current || Platform.OS !== 'android') {
      return;
    }
    hasShownBatteryAlert.current = true;
    try {
      if (await AsyncStorage.getItem(BATTERY_ALERT_KEY)) {
        return;
      }
      await AsyncStorage.setItem(BATTERY_ALERT_KEY, '1');
    } catch {
      // Show the hint anyway if storage is unavailable.
    }
    Alert.alert(
      'Keep location sharing reliable',
      'To keep sharing your location while the app is in the background, turn off battery optimisation for Ticketify in your phone settings.',
      [{text: 'OK', style: 'default'}],
    );
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        refreshPermissionRef.current().catch(() => {});
        if (token) {
          BackgroundLocationService.syncOfflineLocations(token);
        }
        if (isOnline && token) {
          BackgroundLocationService.triggerLocationUpdate().catch(() => {});
        }
      }
    };

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      appStateSubscription?.remove();
    };
  }, [isOnline, token]);

  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        if (!isOnline && (Platform.OS === 'android' || Platform.OS === 'ios')) {
          const isNativeRunning =
            await NativeBackgroundLocationService.isRunning();
          if (isNativeRunning) {
            await NativeBackgroundLocationService.stop();
            activeConfigRef.current = '';
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.warn(
            '[BackgroundLocationManager] Service check error:',
            error,
          );
        }
      }
    };

    const intervalId = setInterval(checkServiceStatus, 60000);
    return () => clearInterval(intervalId);
  }, [isOnline]);

  useEffect(() => {
    const configKey = `${isOnline}|${token ?? ''}|${permissionStatus.granted}`;

    const initializeLocationService = async () => {
      if (!isOnline || !token) {
        if (activeConfigRef.current) {
          await BackgroundLocationService.stop();
          try {
            if (Platform.OS === 'android' || Platform.OS === 'ios') {
              await NativeBackgroundLocationService.stop();
            }
          } catch (error) {
            // ignore stop errors
          }
          activeConfigRef.current = '';
        }
        return;
      }

      if (!permissionStatus.granted) {
        return;
      }

      if (activeConfigRef.current === configKey) {
        BackgroundLocationService.updateConfig({authToken: token});
        return;
      }

      try {
        const apiEndpoint = `${API_BASE_URL}/users/location`;
        const nativeStatus = NativeBackgroundLocationService.getStatus();

        if (
          (Platform.OS === 'android' || Platform.OS === 'ios') &&
          nativeStatus.hasNativeModule
        ) {
          try {
            await NativeBackgroundLocationService.stop();
          } catch (error) {
            // ignore
          }
          await NativeBackgroundLocationService.start(apiEndpoint, token);
        } else {
          BackgroundLocationService.configure({
            apiEndpoint,
            authToken: token,
          });
          await BackgroundLocationService.start();
        }

        activeConfigRef.current = configKey;
        setTimeout(showBatteryOptimizationAlert, 5000);
      } catch (error) {
        if (__DEV__) {
          console.error(
            '[BackgroundLocationManager] Failed to start location service:',
            error,
          );
        }
      }
    };

    initializeLocationService();
  }, [
    isOnline,
    token,
    permissionStatus.granted,
    permissionStatus.status,
    permissionStatus.canRequestAgain,
  ]);

  useEffect(() => {
    if (
      isOnline &&
      token &&
      permissionStatus.granted &&
      activeConfigRef.current
    ) {
      BackgroundLocationService.updateConfig({authToken: token});
    }
  }, [token, isOnline, permissionStatus.granted]);

  useEffect(() => {
    return () => {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        NativeBackgroundLocationService.stop().catch(() => {});
      }
      BackgroundLocationService.stop().catch(() => {});
      activeConfigRef.current = '';
    };
  }, []);

  return null;
};

export default BackgroundLocationManager;
