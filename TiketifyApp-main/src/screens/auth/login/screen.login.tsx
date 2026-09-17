import React from 'react';
import {Dimensions} from 'react-native';
import AuthLayout from '../_layout';
import LoginForm from './login.form';

const {width} = Dimensions.get('window');

type Props = {
  navigation: any;
};

const LoginScreen = (props: Props) => {
  return (
    <AuthLayout
      showLogo={true}
      heading="Welcome back to Techify"
      subHeading="Login to your account using the provided email and password"
      navigation={props.navigation}>
      <LoginForm navigation={props.navigation} />
      {/* sign up */}
    </AuthLayout>
  );
};

export default LoginScreen;
