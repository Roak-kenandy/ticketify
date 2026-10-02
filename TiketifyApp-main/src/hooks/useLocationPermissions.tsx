import { useCallback, useEffect, useState } from 'react';
import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface LocationPermissionStatus {
  granted: boolean;
  canRequestAgain: boolean;
  status: 'granted' | 'denied' | 'blocked' | 'unavailable' | 'loading';
}

export const useLocationPermissions = () => {
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionStatus>({
    granted: false,
    canRequestAgain: true,
    status: 'loading',
  });

  const checkLocationPermission = async (): Promise<LocationPermissionStatus> => {
    try {
      if (Platform.OS === 'android') {
        return await checkAndroidLocationPermission();
      } else {
        return await checkIOSLocationPermission();
      }
    } catch (error) {
      console.error('Error checking location permission:', error);
      return {
        granted: false,
        canRequestAgain: false,
        status: 'unavailable',
      };
    }
  };

  const checkAndroidLocationPermission = async (): Promise<LocationPermissionStatus> => {
    const fineLocationGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (!fineLocationGranted) {
      return {
        granted: false,
        canRequestAgain: true,
        status: 'denied',
      };
    }

    // The foreground service keeps reporting with "While using the app";
    // background access is requested but not required.
    return {
      granted: true,
      canRequestAgain: true,
      status: 'granted',
    };
  };

  const checkIOSLocationPermission = async (): Promise<LocationPermissionStatus> => {
    return new Promise((resolve) => {
      Geolocation.requestAuthorization(
        () => {
          // Authorization granted callback
          Geolocation.getCurrentPosition(
            () => {
              resolve({
                granted: true,
                canRequestAgain: true,
                status: 'granted',
              });
            },
            (error) => {
              const isBlocked = error.code === 1; // PERMISSION_DENIED
              resolve({
                granted: false,
                canRequestAgain: !isBlocked,
                status: isBlocked ? 'blocked' : 'denied',
              });
            },
            {
              enableHighAccuracy: false,
              timeout: 5000,
              maximumAge: 10000,
            }
          );
        },
        () => {
          // Authorization denied callback
          resolve({
            granted: false,
            canRequestAgain: true,
            status: 'denied',
          });
        }
      );
    });
  };

  const requestLocationPermission = async (): Promise<LocationPermissionStatus> => {
    try {
      if (Platform.OS === 'android') {
        return await requestAndroidLocationPermission();
      } else {
        return await requestIOSLocationPermission();
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return {
        granted: false,
        canRequestAgain: false,
        status: 'unavailable',
      };
    }
  };

  const requestAndroidLocationPermission = async (): Promise<LocationPermissionStatus> => {
    // First request fine location
    const fineLocationResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission Required',
        message: 'Ticketify needs access to your location to track your work activities and routes.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );

    if (fineLocationResult !== PermissionsAndroid.RESULTS.GRANTED) {
      const isBlocked = fineLocationResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
      return {
        granted: false,
        canRequestAgain: !isBlocked,
        status: isBlocked ? 'blocked' : 'denied',
      };
    }

    if (typeof Platform.Version === 'number' && Platform.Version >= 29) {
      const hasBackground = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
      );
      if (!hasBackground) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'Background Location Permission',
            message: 'To keep sharing your location when the app is closed, choose "Allow all the time" on the next screen.',
            buttonPositive: 'Continue',
            buttonNegative: 'Skip',
          }
        ).catch(() => undefined);
      }
    }

    return {
      granted: true,
      canRequestAgain: true,
      status: 'granted',
    };
  };

  const requestIOSLocationPermission = async (): Promise<LocationPermissionStatus> => {
    return new Promise((resolve) => {
      Geolocation.requestAuthorization(
        () => {
          // Authorization granted callback
          // Wait a moment for the permission dialog to process
          setTimeout(() => {
            Geolocation.getCurrentPosition(
              () => {
                resolve({
                  granted: true,
                  canRequestAgain: true,
                  status: 'granted',
                });
              },
              (error) => {
                const isBlocked = error.code === 1; // PERMISSION_DENIED
                resolve({
                  granted: false,
                  canRequestAgain: !isBlocked,
                  status: isBlocked ? 'blocked' : 'denied',
                });
              },
              {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 10000,
              }
            );
          }, 1000);
        },
        () => {
          // Authorization denied callback
          resolve({
            granted: false,
            canRequestAgain: true,
            status: 'denied',
          });
        }
      );
    });
  };

  const showPermissionAlert = (status: LocationPermissionStatus) => {
    if (status.status === 'blocked') {
      Alert.alert(
        'Location Permission Blocked',
        'Location access has been blocked. To enable background location tracking, please go to Settings and allow location access for Ticketify.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
    } else if (status.status === 'denied' && Platform.OS === 'ios') {
      Alert.alert(
        'Location Permission Required',
        'For background location tracking to work, please select "Always Allow" in the location permission settings.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Request Again',
            onPress: async () => {
              const newStatus = await requestLocationPermission();
              setPermissionStatus(newStatus);
            },
          },
        ]
      );
    } else if (status.status === 'denied' && Platform.OS === 'android') {
      Alert.alert(
        'Location Permission Required',
        'Ticketify needs location access while you are on shift so dispatch can see you on the live map.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
        ]
      );
    }
  };

  useEffect(() => {
    const initPermissions = async () => {
      const status = await checkLocationPermission();
      setPermissionStatus(status);
    };

    initPermissions();
  }, []);

  const refreshPermissionStatus = async () => {
    const status = await checkLocationPermission();
    setPermissionStatus(status);
    return status;
  };

  const requestPermissionWithAlert = useCallback(
    async (): Promise<LocationPermissionStatus> => {
      const status = await requestLocationPermission();
      setPermissionStatus(status);

      if (!status.granted) {
        showPermissionAlert(status);
      }

      return status;
    },
    [],
  );

  return {
    permissionStatus,
    checkLocationPermission,
    requestLocationPermission: requestPermissionWithAlert,
    refreshPermissionStatus,
    showPermissionAlert,
  };
};
