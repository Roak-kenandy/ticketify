import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';

import colors from '../../constants/colors';

type Props = {
  type?: string;
  text: string;
  onPress: () => void;
  style?: any;
};

const TertiaryButton = (props: Props) => {
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
    maxWidth: 200,
    padding: 10,
    paddingHorizontal: 20,
    borderRadius: 100,
    backgroundColor: '#F4F4F4',
    alignContent: 'center',

    justifyContent: 'center',
    alignItems: 'center',
    // fit width to content
    width: '100%',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colors.secondary,
    // gradient
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 14,
    color: '#000',
  },
});

export default TertiaryButton;
