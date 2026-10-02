import {Formik} from 'formik';
import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useDispatch, useSelector} from 'react-redux';
import * as yup from 'yup';
import PrimaryButton from '../../../components/ui/primary-button';
import colors from '../../../constants/colors';
import {globalStyles, spacing} from '../../../constants/styles';
import {apiPost} from '../../../utils/apiClient';
import {showError, showSuccess} from '../../../utils/notify';
import {saveSession} from '../../../utils/secureSession';

type Props = {
  onDone: () => void;
};

const initialValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const validationSchema = yup.object().shape({
  currentPassword: yup.string().required('Enter your current password'),
  newPassword: yup
    .string()
    .required('Enter a new password')
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters')
    .matches(/[A-Za-z]/, 'Include at least one letter')
    .matches(/\d/, 'Include at least one number')
    .notOneOf([yup.ref('currentPassword')], 'New password must be different'),
  confirmPassword: yup
    .string()
    .required('Confirm your new password')
    .oneOf([yup.ref('newPassword')], 'Passwords do not match'),
});

type FieldName = keyof typeof initialValues;

const FIELDS: {name: FieldName; label: string}[] = [
  {name: 'currentPassword', label: 'Current password'},
  {name: 'newPassword', label: 'New password'},
  {name: 'confirmPassword', label: 'Confirm new password'},
];

const ChangePasswordForm = ({onDone}: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const user = useSelector((state: any) => state.auth?.user);
  const dispatch = useDispatch();
  const [visible, setVisible] = React.useState(false);

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={async (values, helpers) => {
        try {
          const data = await apiPost(
            '/auth/change-password',
            {
              old_password: values.currentPassword,
              new_password: values.newPassword,
            },
            token,
          );
          // The server revokes every older token on password change and returns a fresh one.
          if (data?.access_token) {
            await saveSession(user, data.access_token).catch(() => {});
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {user, isLoggedIn: true, token: data.access_token},
            });
          }
          showSuccess(data?.message || 'Password changed');
          helpers.resetForm();
          onDone();
        } catch (err: any) {
          showError(err?.message || 'Could not change password');
        }
      }}>
      {({
        handleChange,
        handleBlur,
        handleSubmit,
        values,
        errors,
        touched,
        isSubmitting,
      }) => (
        <View style={styles.form}>
          {FIELDS.map((field, index) => (
            <View key={field.name} style={globalStyles.inputContainer}>
              <Text style={globalStyles.label}>{field.label}</Text>
              <View>
                <TextInput
                  secureTextEntry={!visible}
                  style={[globalStyles.input, styles.inputWithIcon]}
                  onChangeText={handleChange(field.name)}
                  onBlur={handleBlur(field.name)}
                  value={values[field.name]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={index === 0 ? 'password' : 'newPassword'}
                  editable={!isSubmitting}
                  autoFocus={index === 0}
                />
                {index === 0 ? (
                  <TouchableOpacity
                    style={styles.eye}
                    onPress={() => setVisible(v => !v)}
                    accessibilityLabel={
                      visible ? 'Hide passwords' : 'Show passwords'
                    }>
                    <Icon
                      name={visible ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.gray2}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
              {errors[field.name] && touched[field.name] ? (
                <Text style={globalStyles.error}>{errors[field.name]}</Text>
              ) : null}
            </View>
          ))}
          <PrimaryButton
            text="Update password"
            onPress={() => handleSubmit()}
            loading={isSubmitting}
            style={styles.submit}
          />
        </View>
      )}
    </Formik>
  );
};

export default ChangePasswordForm;

const styles = StyleSheet.create({
  form: {gap: spacing.lg},
  inputWithIcon: {paddingRight: 48},
  eye: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {marginTop: spacing.sm},
});
