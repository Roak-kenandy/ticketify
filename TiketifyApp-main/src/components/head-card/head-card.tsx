import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';

type Props = {
  heading: string;
  subHeading: string;
  component?: any;
};

const HeadCard = (props: Props) => {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{props.heading}</Text>
      <Text style={styles.subTitle}>{props.subHeading}</Text>
      {props.component}
    </View>
  );
};

export default HeadCard;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
});
