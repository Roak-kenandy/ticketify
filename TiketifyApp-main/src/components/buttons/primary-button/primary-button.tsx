import {View, Text, Button} from 'react-native';
import React from 'react';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

const PrimaryButton = (props: Props) => {
  return (
    <View
      style={{
        marginTop: 20,
      }}>
      <Button
        title={props.title}
        onPress={props.onPress}
        disabled={props.disabled}
        color="#FF6C44"
      />
    </View>
  );
};

export default PrimaryButton;
