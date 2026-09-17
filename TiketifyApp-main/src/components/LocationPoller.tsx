// src/components/LocationPoller.tsx
import {useEffect} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {useSelector} from 'react-redux';

const LocationPoller = () => {
  const {isOnline, token} = useSelector((state: any) => state.auth);

  const getLocation = async () => {
    return new Promise<any>((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => resolve(position.coords),
        error => {
          requestPermissions();
          console.log('Location error:', error);
          reject(error);
        },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    });
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'ios') {
      Geolocation.requestAuthorization(
        () => {
          console.log('Location permission granted');
        },
        () => {
          console.log('Location permission denied');
        }
      );
    } else {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isOnline) {
      console.log('✅ Online: Starting location polling...');
      interval = setInterval(async () => {
        try {
          const location = await getLocation();
          console.log('📍 Location:', location);

          await fetch(
            `https://api.ticketify.medianet.mv/api/v1/users/location`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
              },
              body: JSON.stringify({
                latitude: location.latitude,
                longitude: location.longitude,
              }),
            },
          );
        } catch (error) {
          console.log('❌ Error polling location:', error);
        }
      }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOnline, token]);

  return null; // No UI needed
};

export default LocationPoller;
