import {Formik} from 'formik';
import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as yup from 'yup';
import PrimaryButton from '../../../components/ui/primary-button';
import colors from '../../../constants/colors';
import {globalStyles} from '../../../constants/styles';
import {useDispatch} from 'react-redux';
import * as KeyChain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {OneSignal} from 'react-native-onesignal';
import {apiFetch, formatApiError} from '../../../utils/apiClient';

type Props = {
  navigation: any;
};

const initialValues = {
  email: '',
  password: '',
};

const validationSchema = yup.object().shape({
  email: yup.string().required().email('Please enter a valid email address'),
  password: yup.string().required('Password is required'),
});

const LoginForm = (_props: Props) => {
  const dispatch = useDispatch();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [loginError, setLoginError] = React.useState('');
  const passwordRef = React.useRef<TextInput>(null);

  async function login(email: string, password: string) {
    if (isSubmitting) {
      return;
    }
    setLoginError('');
    setIsSubmitting(true);

    try {
      const {data, response} = await apiFetch('/auth/login', null, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, password}),
      });

      const token = data?.access_token;
      const isSuccess =
        response.ok && Boolean(token) && Boolean(data?.user);

      if (!isSuccess) {
        setLoginError(
          formatApiError(data, 'Invalid email or password'),
        );
        return;
      }

      try {
        await KeyChain.setGenericPassword(
          JSON.stringify(data.user),
          token,
        );
      } catch {
        // Session still valid in memory for this session
      }

      try {
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
      } catch {
        // Non-blocking
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: data.user,
          isLoggedIn: true,
          token,
        },
      });

      setTimeout(() => {
        try {
          OneSignal.login(String(data.user?.id ?? '0'));
          OneSignal.Notifications.requestPermission(false);
        } catch {
          // Push setup must never block login
        }
      }, 1500);
    } catch (err: any) {
      const message =
        err?.message === 'Network request failed'
          ? 'Cannot reach server. Check USB connection and ensure the API is running.'
          : err?.message || 'Something went wrong. Please try again.';
      setLoginError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <View style={styles.formWrap}>
          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={values => login(values.email, values.password)}>
            {({
              handleChange,
              handleBlur,
              handleSubmit,
              values,
              errors,
              touched,
            }) => (
              <View style={styles.formInner}>
                {loginError ? (
                  <View style={globalStyles.errorBanner}>
                    <Text style={globalStyles.errorBannerText}>
                      {loginError}
                    </Text>
                  </View>
                ) : null}

                <View style={globalStyles.inputWrapper}>
                  <Text style={globalStyles.label}>Email</Text>
                  <TextInput
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="name@company.com"
                    placeholderTextColor={colors.gray3}
                    style={globalStyles.input}
                    onChangeText={text => {
                      setLoginError('');
                      handleChange('email')(text);
                    }}
                    onBlur={handleBlur('email')}
                    value={values.email}
                  />
                  {errors.email && touched.email ? (
                    <Text style={globalStyles.error}>{errors.email}</Text>
                  ) : null}
                </View>

                <View style={globalStyles.inputWrapper}>
                  <Text style={globalStyles.label}>Password</Text>
                  <TextInput
                    ref={passwordRef}
                    secureTextEntry
                    placeholder="Enter your password"
                    placeholderTextColor={colors.gray3}
                    style={globalStyles.input}
                    onChangeText={text => {
                      setLoginError('');
                      handleChange('password')(text);
                    }}
                    onBlur={handleBlur('password')}
                    value={values.password}
                    onSubmitEditing={() => handleSubmit()}
                  />
                  {errors.password && touched.password ? (
                    <Text style={globalStyles.error}>{errors.password}</Text>
                  ) : null}
                </View>

                <View style={styles.buttonWrap}>
                  <PrimaryButton
                    text={isSubmitting ? 'Signing in…' : 'Sign in'}
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                    loading={isSubmitting}
                  />
                </View>
              </View>
            )}
          </Formik>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  flex: {flex: 1},
  formWrap: {flex: 1, paddingHorizontal: 4},
  formInner: {flex: 1, justifyContent: 'center', gap: 4},
  buttonWrap: {marginTop: 8, marginBottom: 24},
});

export default LoginForm;
