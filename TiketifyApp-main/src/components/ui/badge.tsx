import {View, Text, Touchable} from 'react-native';
import React from 'react';
import {TouchableOpacity} from 'react-native-gesture-handler';

type Props = {
  title: string;
  onPress?: () => void;
  style?: any;
  textStyle?: any;
  icon?: any;
  color?: string;
  backgroundColor?: string;
};

const ABadge = (props: Props) => {
  return (
    <TouchableOpacity
      onPress={props.onPress}
      style={{
        borderWidth: 1,
        borderRadius: 100,
        borderColor: props.color || '#000',
        backgroundColor: props.backgroundColor || 'transparent',
        padding: 5,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        //   fit the width of the text
        alignSelf: 'flex-start',
        ...props.style,
      }}>
      {props.icon}
      <Text
        style={{
          fontWeight: '500',
          color: props.color || '#000',
          fontSize: 10,
          ...props.textStyle,
        }}>
        {props.title}
      </Text>
    </TouchableOpacity>
  );
};

export default ABadge;
