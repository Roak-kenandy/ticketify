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
      heading="Welcome to Ticketify"
      subHeading="Sign in to manage your field tasks and tickets"
      navigation={props.navigation}>
      <LoginForm navigation={props.navigation} />
      {/* sign up */}
    </AuthLayout>
  );
};

export default LoginScreen;
