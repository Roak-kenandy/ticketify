import {Formik} from 'formik';
import React from 'react';
import {Alert, Text, TextInput, View} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import * as yup from 'yup';
import PrimaryButton from '../../../components/ui/primary-button';
import {globalStyles} from '../../../constants/styles';
import Snackbar from 'react-native-snackbar';

type Props = {
  navigation: any;
};

let initialValues: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
} = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

let validationSchema = yup.object().shape({
  currentPassword: yup
    .string()
    .required('Current Password is required to change password'),
  newPassword: yup
    .string()
    .required('New Password is required to change password')
    .min(6, 'Password must be 6 characters'),
  confirmPassword: yup
    .string()
    .required('Please confirm your new password to change your password')
    .min(6, 'Password must be 6 characters')
    // @ts-ignore
    .oneOf([yup.ref('newPassword'), null], 'Passwords must match'),
});

const ChangePasswordForm = (props: Props) => {
  let token = useSelector((state: any) => state.auth.token);

  return (
    <View>
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={values => {
          fetch(
            'https://api.ticketify.medianet.mv/api/v1/auth/change-password',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                old_password: values.currentPassword,
                new_password: values.newPassword,
              }),
            },
          )
            .then(response => {
              return response.json();
            })
            .then(data => {
              console.log(data);
              Snackbar.show({
                backgroundColor: data.statusCode === 403 ? 'red' : 'green',
                text: data.message,
                duration: Snackbar.LENGTH_SHORT,
              });
              if (data.statusCode != 403) {
                props.navigation.navigate('LoginScreen');
              }
            })
            .catch(error => {
              console.error('Error:', error);
              Snackbar.show({
                backgroundColor: 'red',
                textColor: 'white',
                text: error?.message,
                duration: Snackbar.LENGTH_SHORT,
              });
            });
        }}>
        {({
          handleChange,
          handleBlur,
          handleSubmit,
          values,
          errors,
          touched,
        }) => (
          <View style={globalStyles.container}>
            {/* Password */}
            <View style={globalStyles.inputWrapper}>
              <View style={globalStyles.inputContainer}>
                <Text style={globalStyles.label}>Current Password</Text>
                <TextInput
                  secureTextEntry
                  style={globalStyles.input}
                  onChangeText={handleChange('currentPassword')}
                  onBlur={handleBlur('currentPassword')}
                  value={values.currentPassword}
                  autoFocus
                />
              </View>
              {errors.currentPassword && touched.currentPassword && (
                <Text style={globalStyles.error}>{errors.currentPassword}</Text>
              )}
            </View>
            <View style={globalStyles.inputWrapper}>
              <View style={globalStyles.inputContainer}>
                <Text style={globalStyles.label}>New Password</Text>
                <TextInput
                  secureTextEntry
                  style={globalStyles.input}
                  onChangeText={handleChange('newPassword')}
                  onBlur={handleBlur('newPassword')}
                  value={values.newPassword}
                />
              </View>
              {errors.newPassword && touched.newPassword && (
                <Text style={globalStyles.error}>{errors.newPassword}</Text>
              )}
            </View>
            <View style={globalStyles.inputWrapper}>
              <View style={globalStyles.inputContainer}>
                <Text style={globalStyles.label}>Confirm New Password</Text>
                <TextInput
                  secureTextEntry
                  style={globalStyles.input}
                  onChangeText={handleChange('confirmPassword')}
                  onBlur={handleBlur('confirmPassword')}
                  value={values.confirmPassword}
                />
              </View>
              {errors.confirmPassword && touched.confirmPassword && (
                <Text style={globalStyles.error}>{errors.confirmPassword}</Text>
              )}
            </View>
            <View
              style={{
                flexDirection: 'column',
                justifyContent: 'space-between',
                paddingBottom: 10,
                paddingTop: 20,
                width: '100%',
              }}>
              <PrimaryButton text="Submit" onPress={handleSubmit} />
            </View>
          </View>
        )}
      </Formik>
    </View>
  );
};

export default ChangePasswordForm;
