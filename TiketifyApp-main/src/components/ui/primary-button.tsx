import {View, Text, StyleSheet, Button, TouchableOpacity} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';

type Props = {
  type?: string;
  text: string;
  onPress: () => void;
  style?: any;
};

const PrimaryButton = (props: Props) => {
  return (
    <TouchableOpacity
      style={{
        ...styles.button,
        ...props.style,
      }}
      onPress={props.onPress}>
      <Text
        style={{
          ...styles.buttonText,
        }}>
        {props.text}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 20,
    borderRadius: 100,
    backgroundColor: colors.primary,
    alignContent: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    // gradient
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 14,
    color: colors.white,
  },
});

export default PrimaryButton;
