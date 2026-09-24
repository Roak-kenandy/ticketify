import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import HeadCard from '../../components/head-card/head-card';
import colors from '../../constants/colors';
import {spacing} from '../../constants/styles';

const Logo = require('../../assets/logo.png');

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
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <Image source={Logo} style={styles.logo} />
        <HeadCard heading={props.heading} subHeading={props.subHeading} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.formArea}>
        <View style={styles.formCard}>{props.children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AuthLayout;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  hero: {
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  logo: {
    width: 88,
    height: 88,
    resizeMode: 'contain',
  },
  formArea: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  formCard: {
    flex: 1,
    backgroundColor: colors.white,
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
});
