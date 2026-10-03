import {NavigationContainer} from '@react-navigation/native';
import React, {useEffect} from 'react';
import {Appearance, StatusBar, StyleSheet} from 'react-native';
import {LogLevel, OneSignal} from 'react-native-onesignal';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider as StoreProvider, useDispatch, useSelector} from 'react-redux';
import store from './src/store/store';
import BackgroundLocationManager from './src/components/BackgroundLocationManager';
import GlobalApiLoadingOverlay from './src/components/GlobalApiLoadingOverlay';
import RootNavigation from './src/screens/navigation/RootNavigation';
import colors from './src/constants/colors';
import {subscribeUnauthorized} from './src/utils/apiClient';
import {handleSessionExpired} from './src/utils/session';
import {showInfo} from './src/utils/notify';
import {
  navigationRef,
  openPendingTicket,
  registerPushHandlers,
} from './src/services/pushNotifications';

function SessionWatcher() {
  const dispatch = useDispatch();
  useEffect(
    () =>
      subscribeUnauthorized(() => {
        if (!store.getState().auth?.isLoggedIn) {
          return;
        }
        handleSessionExpired(dispatch).then(() =>
          showInfo('Your session expired. Please sign in again.'),
        );
      }),
    [dispatch],
  );
  return null;
}

/** Opens a ticket from a tapped notification once login (or session restore) finishes. */
function PushNavigator() {
  const isLoggedIn = useSelector((state: any) => state.auth?.isLoggedIn);
  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    const timer = setTimeout(openPendingTicket, 300);
    return () => clearTimeout(timer);
  }, [isLoggedIn]);
  return null;
}

function App(): JSX.Element {
  useEffect(() => {
    Appearance.setColorScheme('light');
  }, []);

  useEffect(() => {
    OneSignal.Debug.setLogLevel(__DEV__ ? LogLevel.Verbose : LogLevel.None);
    OneSignal.initialize('5b39e7af-772d-4fc8-84ae-3236c778faf1');
    return registerPushHandlers();
  }, []);

  return (
    <StoreProvider store={store}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <StatusBar
            barStyle="light-content"
            backgroundColor={colors.primary}
          />
          <NavigationContainer ref={navigationRef} onReady={openPendingTicket}>
            <SessionWatcher />
            <PushNavigator />
            <RootNavigation />
            <GlobalApiLoadingOverlay />
            <BackgroundLocationManager />
          </NavigationContainer>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});

export default App;
