import React from 'react';
import {SafeAreaView, Text, View, PixelRatio} from 'react-native';

import BackButton from '../../../components/buttons/back-button/BackButton';
import HeadCard from '../../../components/head-card/head-card';
import ASwitch from '../../../components/ui/switch';
import ChangePasswordForm from './change-password.form';

type Props = {
  navigation: any;
  route: any;
};

const SettingsChangePasswordScreen = ({navigation, route}: Props) => {
  let [isEnabled, setIsEnabled] = React.useState(true);
  let [isNewletterEnabled, setIsNewletterEnabled] = React.useState(false);

  const fontScale = PixelRatio.getFontScale();
  const getFontSize = (size: number) => {
    return size / fontScale;
  };

  return (
    <SafeAreaView
      style={{
        gap: 10,
        backgroundColor: '#fff',
        flex: 1,
      }}>
      <View
        style={{
          paddingTop: 20,
          paddingHorizontal: 20,
        }}>
        <BackButton navigation={navigation} />
      </View>
      <View
        style={{
          padding: 20,
          gap: 20,
        }}>
        {/* blue background absolute */}
        <Text
          style={{color: '#000', fontWeight: '700', fontSize: getFontSize(28)}}>
          Change Password
        </Text>
        <View>
          {/* absolute blue back */}
          <Text
            style={{
              color: '#000',
              fontSize: getFontSize(14),
            }}>
            Change your password here to keep your account secure
          </Text>
        </View>

        <ChangePasswordForm navigation={navigation} />
      </View>
    </SafeAreaView>
  );
};

export default SettingsChangePasswordScreen;
