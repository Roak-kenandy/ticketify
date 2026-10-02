import React from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native';
import * as KeyChain from 'react-native-keychain';
import {useDispatch} from 'react-redux';
import {OneSignal} from 'react-native-onesignal';
import colors from '../../constants/colors';
import {spacing} from '../../constants/styles';
import {apiGet, isTokenExpired} from '../../utils/apiClient';
import {clearStoredSession} from '../../utils/session';

type Props = {
  navigation: any;
};

const SplashScreen = (props: Props) => {
  const navigate = props.navigation;
  const dispatch = useDispatch();
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const slowTimer = setTimeout(() => setSlow(true), 2500);

    const goToLogin = () => {
      if (!cancelled) {
        navigate.replace('LoginScreen');
      }
    };

    async function bootstrapSession() {
      let credentials: false | KeyChain.UserCredentials = false;
      try {
        credentials = await KeyChain.getGenericPassword();
      } catch {
        goToLogin();
        return;
      }
      if (!credentials || !credentials.password) {
        goToLogin();
        return;
      }

      const token = credentials.password;
      let storedUser: any = null;
      try {
        storedUser = JSON.parse(credentials.username);
      } catch {
        storedUser = null;
      }

      if (isTokenExpired(token)) {
        await clearStoredSession(dispatch);
        goToLogin();
        return;
      }

      let profile = storedUser;
      try {
        profile =
          (await apiGet('/users/me', token, {timeoutMs: 10000})) ?? storedUser;
      } catch (error: any) {
        if (error?.status === 401 || error?.status === 403) {
          await clearStoredSession(dispatch);
          goToLogin();
          return;
        }
        // Offline or server hiccup: keep the valid session and let the
        // background sync refresh the profile once the network is back.
        if (!storedUser) {
          goToLogin();
          return;
        }
      }

      if (cancelled) {
        return;
      }
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {user: profile, isLoggedIn: true, token},
      });
      if (profile?.id) {
        try {
          OneSignal.login(String(profile.id));
        } catch {
          // Push registration is best effort.
        }
      }
    }

    bootstrapSession();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, [dispatch, navigate]);

  return (
    <View style={styles.root}>
      <Image style={styles.logo} source={require('../../assets/logo.png')} />
      {slow ? (
        <View style={styles.status}>
          <ActivityIndicator color={colors.white} />
          <Text style={styles.statusText}>Restoring your session…</Text>
        </View>
      ) : null}
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {height: 150, width: 150},
  status: {
    position: 'absolute',
    bottom: 64,
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {color: 'rgba(255,255,255,0.8)', fontSize: 13},
});
