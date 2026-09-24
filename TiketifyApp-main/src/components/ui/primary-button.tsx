import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';

type Props = {
  text: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  loading?: boolean;
};

const PrimaryButton = (props: Props) => {
  const isDisabled = props.disabled || props.loading;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isDisabled && styles.buttonDisabled,
        props.style,
      ]}
      onPress={props.onPress}
      disabled={isDisabled}
      activeOpacity={0.85}>
      {props.loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text style={styles.buttonText}>{props.text}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
    color: colors.white,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});

export default PrimaryButton;
