import React from 'react';
import {Image, View} from 'react-native';
import * as KeyChain from 'react-native-keychain';
import {useDispatch, useSelector} from 'react-redux';
import colors from '../../constants/colors';

type Props = {
  navigation: any;
};

const SplashScreen = (props: Props) => {
  let navigate = props.navigation;
  let dispatch = useDispatch();
  let [authorized, setAuthorized] = React.useState(false);

  async function getKeyChain() {
    const credentials = await KeyChain.getGenericPassword();
    if (credentials) {
      setAuthorized(true);
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: JSON.parse(credentials.username),
          isLoggedIn: true,
          token: credentials.password,
        },
      });
      navigate.navigate('HomeScreen');
      console.log('Credentials successfully loaded for user ');
    } else {
      setAuthorized(false);
      navigate.navigate('LoginScreen');
      console.log('No credentials stored');
    }
  }

  React.useEffect(() => {
    getKeyChain();
  }, []);

  //   if authorized && state.isLoggedIn navigate.navigate('HomeScreen');

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
