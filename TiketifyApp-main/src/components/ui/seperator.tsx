import {View, Text} from 'react-native';
import React from 'react';

type Props = {
  style?: any;
};

const ASeperator = (props: Props) => {
  return (
    <View
      style={{
        borderBottomColor: '#ccc',
        borderBottomWidth: 0.8,
        width: '100%',
        zIndex: 999,
        marginVertical: 5,
        ...props.style,
      }}></View>
  );
};

export default ASeperator;
