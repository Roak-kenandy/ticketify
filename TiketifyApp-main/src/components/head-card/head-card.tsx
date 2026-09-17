import {PixelRatio, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';

type Props = {
  heading: string;
  subHeading: string;
  component?: any;
};

const fontScale = PixelRatio.getFontScale();
const getFontSize = (size: number) => {
  return size / fontScale;
};

const HeadCard = (props: Props) => {
  return (
    <View style={styles.container}>
      <View
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'fcenter',
          gap: 5,
        }}>
        <Text style={styles.heading}>{props.heading}</Text>
        <Text style={styles.subTitle}>{props.subHeading}</Text>
      </View>
      {props.component && props.component}
    </View>
  );
};

export default HeadCard;

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingBottom: 10,
  },
  heading: {
    fontSize: getFontSize(24),
    fontWeight: 'bold',
    color: colors.white,
    textAlign: 'center',
    width: '100%',
  },
  subTitle: {
    fontSize: getFontSize(14),
    color: colors.white,
    textAlign: 'center',
  },
});
