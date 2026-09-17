import {View, Text, PixelRatio} from 'react-native';
import React from 'react';
import PrimaryButton from '../ui/primary-button';

const fontScale = PixelRatio.getFontScale();
const getFontSize = (size: number) => {
  return size / fontScale;
};

type Props = {
  name?: string;
  value?: string;
  placeholder?: string;
  button?: {
    type: string;
    text: string;
    onPress: () => void;
  };
  children?: any;
};

const ItemRender = (props: Props) => {
  return (
    <View
      style={{
        gap: 3,
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
      }}>
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: -14,
        }}>
        {props.button && (
          <PrimaryButton
            style={{
              fontSize: getFontSize(13),
              padding: 5,
            }}
            onPress={props.button.onPress}
            text={props.button.text}
            type={props.button.type}
          />
        )}
      </View>
      <Text
        style={{
          color: '#000',
          fontSize: getFontSize(10),
        }}>
        {props.name}
      </Text>
      {props.children ? (
        <View>{props.children}</View>
      ) : (
        <Text
          style={{
            fontSize: getFontSize(13),
            fontWeight: '500',
            color: '#000',
            // truncate
            width: 300,
            overflow: 'hidden',
          }}>
          {props.value}
        </Text>
      )}
    </View>
  );
};

export default ItemRender;
