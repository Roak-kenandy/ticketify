import React from 'react';
import {StyleSheet, Text, TouchableOpacity, ViewStyle} from 'react-native';
import colors from '../../constants/colors';

type Props = {
  type?: string;
  text: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
};

const SecondaryButton = (props: Props) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        props.disabled && styles.buttonDisabled,
        props.style,
      ]}
      onPress={props.onPress}
      disabled={props.disabled}
      activeOpacity={0.85}>
      <Text style={styles.buttonText}>{props.text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.bordergray,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
    color: colors.black,
    letterSpacing: 0.3,
  },
});

export default SecondaryButton;
