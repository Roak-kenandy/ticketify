import React from 'react';
import {
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import BackButton from '../../components/buttons/back-button/BackButton';
import HeadCard from '../../components/head-card/head-card';
import colors from '../../constants/colors';
const Logo = require('../../assets/logo.png');

let {width} = Dimensions.get('window');

type Props = {
  heading: string;
  subHeading: string;
  navigation: any;
  route?: any;
  showLogo?: boolean;
  isBackButton?: boolean;
  children: any;
};

const AuthLayout = (props: Props) => {
  return (
    <View
      style={{
        flex: 1,
        paddingTop: Platform.OS === 'ios' ? 60 : 175,
        backgroundColor: colors.white,
      }}>
      {props.isBackButton && (
        <View
          style={{
            marginLeft: 20,
          }}>
          <BackButton
            style={{
              zIndex: 1000,
            }}
            route={props.route}
            navigation={props.navigation}
          />
        </View>
      )}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: 20,
          paddingTop: 80,
          backgroundColor: colors.primary,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
        }}>
        <Image source={Logo} style={styles.logo} />
        <View
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 20,
            paddingTop: 20,
          }}>
          <HeadCard heading={props.heading} subHeading={props.subHeading} />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{
          ...styles.container,
          marginTop: Platform.OS === 'ios' ? 200 : 80,
        }}>
        {props.children}
      </KeyboardAvoidingView>
    </View>
  );
};

export default AuthLayout;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    gap: 30,
  },
  logo: {
    width: 100,
    height: 100,
    objectFit: 'contain',
    alignSelf: 'center',
  },
  lowerText: {
    marginTop: 20,
    position: 'absolute',
    bottom: 0,
    left: (width - 200) / 2,
    right: (width - 200) / 2,
    width: 300,
    display: 'flex',
    flexDirection: 'row',
    gap: 5,
  },
});
