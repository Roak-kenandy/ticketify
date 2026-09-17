import {View, Text, TouchableOpacity} from 'react-native';
import React from 'react';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  buttonText?: string | null;
  buttonIcon: string;
  component?: any;
  flex?: number;
  onPress?: () => void;
};

const IconButton = (props: Props) => {
  return (
    <TouchableOpacity
      onPress={props.onPress}
      style={{
        backgroundColor: 'white',
        padding: 8,
        paddingHorizontal: 20,
        borderRadius: 10,
        marginTop: 10,
        display: 'flex',
        flex: props.flex,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <Icon name={props.buttonIcon} size={20} color="black" />
      <Text
        style={{
          color: 'black',
          fontWeight: 'bold',
          marginLeft: 10,
          textDecorationLine: 'underline',
          textDecorationColor: 'black',
        }}>
        {props.buttonText}
      </Text>
      {/* Number of cart items */}
      {props.component ? props.component : null}
    </TouchableOpacity>
  );
};

export default IconButton;
