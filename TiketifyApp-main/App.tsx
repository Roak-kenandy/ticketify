import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import React, {useEffect} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Provider as StoreProvider} from 'react-redux';
import store from './src/store/store';

import {Appearance} from 'react-native';
import {LogLevel, OneSignal} from 'react-native-onesignal';
import BackgroundLocationManager from './src/components/BackgroundLocationManager';
import RootNavigation from './src/screens/navigation/RootNavigation';

function App(): JSX.Element {
  useEffect(() => {
    Appearance.setColorScheme('light'); // Force light mode
  }, []);

  useEffect(() => {
    // OneSignal initialization should happen after React Native is fully loaded
    OneSignal.Debug.setLogLevel(LogLevel.Verbose);

    // OneSignal Initialization
    OneSignal.initialize('5b39e7af-772d-4fc8-84ae-3236c778faf1');

    // requestPermission will show the native iOS or Android notification permission prompt.
    // We recommend removing the following code and instead using an In-App Message to prompt for notification permission
    OneSignal.Notifications.requestPermission(true);

    // Method for listening for notification clicks
    OneSignal.Notifications.addEventListener('click', event => {
      console.log('OneSignal: notification clicked:', event);
    });
  }, []);

  return (
    <StoreProvider store={store}>
      <GestureHandlerRootView style={{flex: 1}}>
        <NavigationContainer
          initialState={{
            index: 0,
            routes: [
              {
                name: 'SplashScreen',
              },
            ],
          }}>
          <RootNavigation />
          <BackgroundLocationManager />
        </NavigationContainer>
      </GestureHandlerRootView>
    </StoreProvider>
  );
}

export default App;
