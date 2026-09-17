import {createNativeStackNavigator} from '@react-navigation/native-stack';
import React from 'react';
import {useSelector} from 'react-redux';

import LoginScreen from '../auth/login/screen.login';
import SplashScreen from '../onboarding/splash.screen';
import ActivityDetailsScreen from '../activities/activity-details/activity-details.screen';
import CameraScreen from '../camera/camera.screen';
import SettingsChangePasswordScreen from '../settings/change-password/change-password.screen';
import DrawerNavigation from './DrawerNavigation';

const Stack = createNativeStackNavigator();

export default function RootNavigation() {
  const isLoggedIn = useSelector((state: any) => state.auth.isLoggedIn);

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {!isLoggedIn ? (
        <>
          <Stack.Screen name="SplashScreen" component={SplashScreen} />
          <Stack.Screen name="LoginScreen" component={LoginScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="HomeScreen" component={DrawerNavigation} />
          <Stack.Screen
            name="ChangePasswordScreen"
            component={SettingsChangePasswordScreen}
          />
          <Stack.Screen
            name="ActivityDetailsScreen"
            component={ActivityDetailsScreen}
          />
          <Stack.Group screenOptions={{presentation: 'modal'}}>
            <Stack.Screen name="CameraScreen" component={CameraScreen} />
          </Stack.Group>
        </>
      )}
    </Stack.Navigator>
  );
}
