import React, {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';
import {AppState, AppStateStatus, Alert, Platform} from 'react-native';
import BackgroundLocationService from '../services/BackgroundLocationService';
import NativeBackgroundLocationService from '../services/NativeBackgroundLocationService';
import {useLocationPermissions} from '../hooks/useLocationPermissions';

const BackgroundLocationManager: React.FC = () => {
  const {isOnline, token} = useSelector((state: any) => state.auth);
  const {permissionStatus, requestLocationPermission} =
    useLocationPermissions();
  const hasShownBatteryAlert = useRef(false);

  // Show battery optimization alert once
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
      console.log(
        '[BackgroundLocationManager] App state changed to:',
        nextAppState,
      );

      if (nextAppState === 'active') {
        // App came to foreground, sync offline locations
        BackgroundLocationService.syncOfflineLocations();

        // Check for background activity proof
        const checkBackgroundActivity = async () => {
          const proofs = await BackgroundLocationService.getBackgroundProofs();
          if (proofs.length > 0) {
            console.log(
              `[BackgroundLocationManager] 🎉 FOUND ${proofs.length} BACKGROUND ACTIVITIES!`,
            );
            proofs.forEach((proof, index) => {
              console.log(
                `[BackgroundLocationManager] Background Activity ${index + 1}:`,
                {
                  timestamp: proof.timestamp,
                  type: proof.type,
                  data: proof.data,
                },
              );
            });
            // Clear proofs after showing them
            await BackgroundLocationService.clearBackgroundProofs();
          } else {
            console.log(
              '[BackgroundLocationManager] ⚠️ No background activity detected',
            );
          }
        };

        checkBackgroundActivity();

        // Log current service status
        const status = BackgroundLocationService.getStatus();
        console.log('[BackgroundLocationManager] Service Status:', status);
      } else if (nextAppState === 'background') {
        console.log(
          '[BackgroundLocationManager] App going to background - background service should continue running',
        );
        const status = BackgroundLocationService.getStatus();
        if (status.started && status.backgroundTimerRunning) {
          console.log(
            '[BackgroundLocationManager] ✅ Background location service is active',
          );
        } else {
          console.warn(
            '[BackgroundLocationManager] ⚠️ Background service may not be running properly',
          );
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
  }, []);

  // Periodic check to ensure services are only running when user is online
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        // If user goes offline, stop native services
        if (!isOnline && (Platform.OS === 'android' || Platform.OS === 'ios')) {
          const isNativeRunning = await NativeBackgroundLocationService.isRunning();
          if (isNativeRunning) {
            console.log('[BackgroundLocationManager] User went offline - stopping native service');
            await NativeBackgroundLocationService.stop();
          }
        }
      } catch (error) {
        console.warn('[BackgroundLocationManager] Error in periodic service check:', error);
      }
    };

    // Check every 30 seconds if services should still be running
    const intervalId = setInterval(checkServiceStatus, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isOnline]);

  useEffect(() => {
    const initializeLocationService = async () => {
      console.log(
        '[BackgroundLocationManager] Initializing location service...',
      );
      console.log('- isOnline:', isOnline);
      console.log('- hasToken:', !!token);
      console.log('- permissionStatus:', permissionStatus);

      // Only start if user is online, has token, and permissions are granted
      if (!isOnline || !token) {
        console.log(
          '[BackgroundLocationManager] Not starting - user offline or no token',
        );
        
        // Stop both React Native service and native services
        await BackgroundLocationService.stop();
        
        // Also stop native services if they're running
        try {
          if (Platform.OS === 'android' || Platform.OS === 'ios') {
            const isNativeRunning = await NativeBackgroundLocationService.isRunning();
            if (isNativeRunning) {
              console.log('[BackgroundLocationManager] Stopping native service - user offline or no token');
              await NativeBackgroundLocationService.stop();
            }
          }
        } catch (error) {
          console.warn('[BackgroundLocationManager] Error stopping native service:', error);
        }
        
        return;
      }

      if (!permissionStatus.granted) {
        console.log(
          '[BackgroundLocationManager] Not starting - location permission not granted',
        );

        // If permissions are not granted but can be requested, try to request them
        if (
          permissionStatus.canRequestAgain &&
          permissionStatus.status !== 'loading'
        ) {
          console.log(
            '[BackgroundLocationManager] Requesting location permissions...',
          );
          const newPermissionStatus = await requestLocationPermission();

          if (!newPermissionStatus.granted) {
            console.log(
              '[BackgroundLocationManager] Permission request denied',
            );
            await BackgroundLocationService.stop();
            
            // Also stop native services
            try {
              if (Platform.OS === 'android' || Platform.OS === 'ios') {
                await NativeBackgroundLocationService.stop();
              }
            } catch (error) {
              console.warn('[BackgroundLocationManager] Error stopping native service:', error);
            }
            
            return;
          }
        } else {
          await BackgroundLocationService.stop();
          
          // Also stop native services
          try {
            if (Platform.OS === 'android' || Platform.OS === 'ios') {
              await NativeBackgroundLocationService.stop();
            }
          } catch (error) {
            console.warn('[BackgroundLocationManager] Error stopping native service:', error);
          }
          
          return;
        }
      }

      try {
        const apiEndpoint = 'https://api.ticketify.medianet.mv/api/v1/users/location';
        
        // Check if native module is available first
        const nativeStatus = NativeBackgroundLocationService.getStatus();
        
        if ((Platform.OS === 'android' || Platform.OS === 'ios') && nativeStatus.hasNativeModule) {
          // Use native service when available
          console.log(`[BackgroundLocationManager] Starting native ${Platform.OS} background service`);
          try {
            await NativeBackgroundLocationService.start(apiEndpoint, token);
            console.log(`[BackgroundLocationManager] ✅ Native ${Platform.OS} background service started`);
          } catch (error) {
            console.warn(`[BackgroundLocationManager] ⚠️ Failed to start native ${Platform.OS} service, falling back to React Native service:`, error);
            // Fallback to React Native service
            BackgroundLocationService.configure({ apiEndpoint, authToken: token });
            await BackgroundLocationService.start();
            console.log('[BackgroundLocationManager] ✅ React Native background service started (fallback)');
          }
        } else {
          // Fallback to React Native background timer
          console.log('[BackgroundLocationManager] Starting React Native background service (native module not available)');
          BackgroundLocationService.configure({ apiEndpoint, authToken: token });
          await BackgroundLocationService.start();
          console.log('[BackgroundLocationManager] ✅ React Native background service started');
        }

        // Show battery optimization alert
        showBatteryOptimizationAlert();

        // Log service status for debugging
        setTimeout(() => {
          const nativeStatus = NativeBackgroundLocationService.getStatus();
          const reactStatus = BackgroundLocationService.getStatus();
          console.log('[BackgroundLocationManager] Service Status:', {
            native: nativeStatus,
            react: reactStatus
          });
        }, 2000);
      } catch (error) {
        console.error(
          '[BackgroundLocationManager] ❌ Failed to start background location service:',
          error,
        );
      }
    };

    initializeLocationService();
  }, [
    isOnline,
    token,
    permissionStatus.granted,
    permissionStatus.status,
    requestLocationPermission,
  ]);

  useEffect(() => {
    // Update auth token if it changes while service is running
    if (
      isOnline &&
      token &&
      permissionStatus.granted &&
      BackgroundLocationService.isRunning()
    ) {
      console.log('[BackgroundLocationManager] Updating auth token...');
      BackgroundLocationService.updateConfig({authToken: token});
    }
  }, [token, isOnline, permissionStatus.granted]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log(
        '[BackgroundLocationManager] Component unmounting, stopping background location service...',
      );
      
      // Stop native service if supported
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        NativeBackgroundLocationService.stop().catch(error => {
          console.error(
            '[BackgroundLocationManager] Error stopping native background location service:',
            error,
          );
        });
      }
      
      // Stop React Native service
      BackgroundLocationService.stop().catch(error => {
        console.error(
          '[BackgroundLocationManager] Error stopping background location service:',
          error,
        );
      });
    };
  }, []);

  // This component doesn't render anything
  return null;
};

export default BackgroundLocationManager;
