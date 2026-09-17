import {View, Text, Switch} from 'react-native';
import React from 'react';
import colors from 'src/constants/colors';

type Props = {
  isEnabled: boolean;
  toggleSwitch?: () => void;
};

const ASwitch = (props: Props) => {
  return (
    <Switch
      trackColor={{false: 'gainsboro', true: colors.primary}}
      thumbColor={props.isEnabled ? 'white' : 'white'}
      ios_backgroundColor="gainsboro"
      onValueChange={props.toggleSwitch}
      value={props.isEnabled}
    />
  );
};

export default ASwitch;
