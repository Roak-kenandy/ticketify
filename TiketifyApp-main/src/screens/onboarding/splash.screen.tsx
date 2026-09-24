import React from 'react';
import {Image, View} from 'react-native';
import * as KeyChain from 'react-native-keychain';
import {useDispatch} from 'react-redux';
import colors from '../../constants/colors';
import {apiGet, isTokenExpired} from '../../utils/apiClient';
import {clearStoredSession} from '../../utils/session';

type Props = {
  navigation: any;
};

const SplashScreen = (props: Props) => {
  const navigate = props.navigation;
  const dispatch = useDispatch();
  React.useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      try {
        const credentials = await KeyChain.getGenericPassword();
        if (!credentials?.password) {
          if (!cancelled) {
            navigate.replace('LoginScreen');
          }
          return;
        }

        const token = credentials.password;
        const storedUser = JSON.parse(credentials.username);

        if (isTokenExpired(token)) {
          await clearStoredSession(dispatch);
          if (!cancelled) {
            navigate.replace('LoginScreen');
          }
          return;
        }

        try {
          const profile = await apiGet('/users/me', token);
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: profile ?? storedUser,
              isLoggedIn: true,
              token,
            },
          });
        } catch {
          await clearStoredSession(dispatch);
          if (!cancelled) {
            navigate.replace('LoginScreen');
          }
        }
      } catch {
        if (!cancelled) {
          navigate.replace('LoginScreen');
        }
      }
    }

    bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [dispatch, navigate]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <Image
        style={{
          height: 150,
          width: 150,
        }}
        source={require('../../assets/logo.png')}
      />
    </View>
  );
};

export default SplashScreen;
