import {NavigationContainer} from '@react-navigation/native';
import React, {useEffect} from 'react';
import {Appearance} from 'react-native';
import {LogLevel, OneSignal} from 'react-native-onesignal';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {Provider as StoreProvider} from 'react-redux';
import store from './src/store/store';
import BackgroundLocationManager from './src/components/BackgroundLocationManager';
import RootNavigation from './src/screens/navigation/RootNavigation';

function App(): JSX.Element {
  useEffect(() => {
    Appearance.setColorScheme('light');
  }, []);

  useEffect(() => {
    OneSignal.Debug.setLogLevel(__DEV__ ? LogLevel.Verbose : LogLevel.None);
    OneSignal.initialize('5b39e7af-772d-4fc8-84ae-3236c778faf1');

    OneSignal.Notifications.addEventListener('click', event => {
      if (__DEV__) {
        console.log('OneSignal: notification clicked:', event);
      }
    });
  }, []);

  return (
    <StoreProvider store={store}>
      <GestureHandlerRootView style={{flex: 1}}>
        <NavigationContainer>
          <RootNavigation />
          <BackgroundLocationManager />
        </NavigationContainer>
      </GestureHandlerRootView>
    </StoreProvider>
  );
}

export default App;
