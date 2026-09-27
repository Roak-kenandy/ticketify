import React, {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';
import {AppState, AppStateStatus, Alert, Platform} from 'react-native';
import BackgroundLocationService from '../services/BackgroundLocationService';
import NativeBackgroundLocationService from '../services/NativeBackgroundLocationService';
import {useLocationPermissions} from '../hooks/useLocationPermissions';
import {API_BASE_URL} from '../config/api';

const BackgroundLocationManager: React.FC = () => {
  const isOnline = useSelector((state: any) => state.auth?.isOnline);
  const token = useSelector((state: any) => state.auth?.token);
  const {permissionStatus, requestLocationPermission} =
    useLocationPermissions();
  const hasShownBatteryAlert = useRef(false);
  const activeConfigRef = useRef('');
  const requestPermissionRef = useRef(requestLocationPermission);

  requestPermissionRef.current = requestLocationPermission;

  const showBatteryOptimizationAlert = () => {
    if (!hasShownBatteryAlert.current && Platform.OS === 'android') {
      hasShownBatteryAlert.current = true;
      Alert.alert(
        'Battery Optimization',
        'For reliable background location tracking, please disable battery optimization for Ticketify in your device settings. This ensures location updates continue when the app is closed.',
        [{text: 'OK', style: 'default'}],
      );
    }
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        BackgroundLocationService.syncOfflineLocations();
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
          console.warn('[BackgroundLocationManager] Service check error:', error);
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
  }, [isOnline, token, permissionStatus.granted, permissionStatus.status, permissionStatus.canRequestAgain]);

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
