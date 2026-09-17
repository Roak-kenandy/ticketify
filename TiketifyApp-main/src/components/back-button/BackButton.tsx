import {View, Text, TouchableOpacity} from 'react-native';
import React from 'react';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  navigation: any;
  route?: any;
  style?: any;
};

const BackButton = (props: Props) => {
  return (
    <View style={props.style}>
      <TouchableOpacity
        style={{
          backgroundColor: 'white',
          borderRadius: 50,
          width: 40,
          height: 40,
          display: 'flex',
          alignContent: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 3,
          marginTop: 0,

          zIndex: 1000,
          borderColor: '#f3f3f3',
          borderWidth: 1,
        }}
        onPress={() => {
          // navigate back
          props.navigation.goBack();
        }}>
        <Icon name="chevron-back" size={20} />
      </TouchableOpacity>
    </View>
  );
};

export default BackButton;
