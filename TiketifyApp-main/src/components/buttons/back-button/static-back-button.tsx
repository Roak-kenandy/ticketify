import {View, Text, TouchableOpacity} from 'react-native';
import React from 'react';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  navigation: any;
  route?: any;
  style?: any;
};

const StaticBackButton = (props: Props) => {
  return (
    <View style={props.style}>
      <TouchableOpacity
        style={{
          backgroundColor: 'white',
          borderRadius: 50,
          width: 30,
          padding: 3,
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 3,
          },
          shadowOpacity: 0.09,
          borderColor: '#f3f3f3',
          borderWidth: 1,
        }}
        onPress={() => {
          // navigate back to home screen
          props.navigation.back(-1);
        }}>
        <Icon name="ios-chevron-back-outline" size={20} />
      </TouchableOpacity>
    </View>
  );
};

export default StaticBackButton;
