import {Formik} from 'formik';
import React from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as yup from 'yup';
import PrimaryButton from '../../../components/ui/primary-button';
import colors from '../../../constants/colors';
import {globalStyles} from '../../../constants/styles';

import {useDispatch} from 'react-redux';
// import {OneSignal} from 'react-native-onesignal';
import * as KeyChain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Snackbar from 'react-native-snackbar';
import {OneSignal} from 'react-native-onesignal';

type Props = {
  navigation: any;
};

let initialValues: {
  email: string;
  password: string;
} = {
  email: '',
  password: '',
};

let validationSchema = yup.object().shape({
  email: yup.string().required().email('Please enter a valid email address'),
  password: yup.string().required(),
});

const LoginForm = (props: Props) => {
  let dispatch = useDispatch();
  function login(email: string, password: string) {
    console.log('Login called with:', email, password);
    fetch('https://api.ticketify.medianet.mv/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    })
      .then(response => {
        return response.json();
      })
      .then(data => {
        console.log(data);
        if (data.statusCode === 200) {
          // store the token
          KeyChain.setGenericPassword(
            JSON.stringify(data.user),
            data.access_token,
          );

          OneSignal.login(data?.user?.id.toString() ?? '0');
          OneSignal.Notifications.requestPermission(true);

          // OneSignal.login(data?.user?.id.toString() ?? '0');
          // OneSignal.Notifications.requestPermission(true);
          AsyncStorage.setItem('user', JSON.stringify(data.user));
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: data.user,
              isLoggedIn: true,
              token: data.access_token,
            },
          });
          props.navigation.navigate('HomeScreen');
        } else if (data.statusCode === 403) {
          Snackbar.show({
            backgroundColor: 'red',
            textColor: colors.white,
            text: 'Invalid email or password',
            duration: Snackbar.LENGTH_SHORT,
          });
        } else {
          Alert.alert('Error', 'An error occurred', [
            {
              text: 'OK',
              onPress: () => console.log('OK Pressed'),
            },
          ]);
        }
      })
      .catch(err => {
        Snackbar.show({
          backgroundColor: 'red',
          textColor: colors.white,
          text: 'An error occurred',
          duration: Snackbar.LENGTH_SHORT,
        });
        console.log('Error');
        console.log(err);
      });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{flex: 1}}>
        <View style={{flex: 1, paddingHorizontal: 16}}>
          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={values => {
              login(values.email, values.password);
            }}>
            {({
              handleChange,
              handleBlur,
              handleSubmit,
              values,
              errors,
              touched,
            }) => (
              <View style={{flex: 1, justifyContent: 'space-between'}}>
                <View style={{paddingTop: 40}}>
                  <View style={globalStyles.inputWrapper}>
                    <View style={globalStyles.inputContainer}>
                      <Text style={globalStyles.label}>Email</Text>
                      <View
                        style={{flexDirection: 'row', alignItems: 'center'}}>
                        <TextInput
                          ref={ref => {
                            // @ts-ignore
                            this._emailRef = ref;
                          }}
                          onSubmitEditing={() => {
                            // @ts-ignore
                            this._passwordInput.focus();
                          }}
                          keyboardType="default"
                          style={globalStyles.input}
                          onChangeText={handleChange('email')}
                          onBlur={handleBlur('email')}
                          value={values.email}
                        />
                      </View>
                    </View>
                    {errors.email && touched.email && (
                      <Text style={globalStyles.error}>{errors.email}</Text>
                    )}
                  </View>

                  {/* Password */}
                  <View style={globalStyles.inputWrapper}>
                    <View style={globalStyles.inputContainer}>
                      <Text style={globalStyles.label}>Password</Text>
                      <TextInput
                        ref={ref => {
                          // @ts-ignore
                          this._passwordInput = ref;
                        }}
                        secureTextEntry
                        style={globalStyles.input}
                        onChangeText={handleChange('password')}
                        onBlur={handleBlur('password')}
                        value={values.password}
                      />
                    </View>
                    {errors.password && touched.password && (
                      <Text style={globalStyles.error}>{errors.password}</Text>
                    )}
                  </View>
                </View>

                {/* Login button at the bottom */}
                <View style={{marginBottom: 40}}>
                  <PrimaryButton text="Log in" onPress={handleSubmit} />
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
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    padding: 10,
    height: 40,
    color: colors.black,
  },
});

export default LoginForm;
