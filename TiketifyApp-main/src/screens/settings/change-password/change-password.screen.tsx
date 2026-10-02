import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import StackHeader from '../../../components/layout/stack-header';
import colors from '../../../constants/colors';
import {globalStyles, spacing} from '../../../constants/styles';
import ChangePasswordForm from './change-password.form';

type Props = {
  navigation: any;
};

const SettingsChangePasswordScreen = ({navigation}: Props) => (
  <View style={styles.screen}>
    <StackHeader
      title="Change password"
      subtitle="Keep your account secure"
      onBack={() => navigation.goBack()}
    />
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={globalStyles.card}>
          <ChangePasswordForm onDone={() => navigation.goBack()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
);

export default SettingsChangePasswordScreen;

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  flex: {flex: 1},
  content: {padding: spacing.lg},
});
