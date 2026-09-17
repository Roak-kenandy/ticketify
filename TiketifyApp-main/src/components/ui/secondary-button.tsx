import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import colors from '../../constants/colors';

type Props = {
  type?: string;
  text: string;
  onPress: () => void;
  style?: any;
};

const SecondaryButton = (props: Props) => {
  return (
    <TouchableOpacity
      style={[styles.button, props.style]}
      onPress={props.onPress}>
      <Text style={styles.buttonText}>{props.text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 20,
    borderRadius: 100,
    backgroundColor: colors.gray,
    alignContent: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    // gradient
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 14,
    color: colors.black,
  },
});

export default SecondaryButton;
