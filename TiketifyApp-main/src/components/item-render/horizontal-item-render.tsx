import {PixelRatio, Text, View} from 'react-native';
import colors from 'src/constants/colors';

const fontScale = PixelRatio.getFontScale();
const getFontSize = (size: number) => {
  return size / fontScale;
};

export const HorizontalItemValue = (props: any) => {
  return (
    <View
      style={{
        flex: 1,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
      <Text style={{fontSize: getFontSize(14), color: colors.black}}>
        {props.title}
      </Text>
      <Text
        style={{
          fontSize: getFontSize(14),
          color: colors.black,
          fontWeight: '600',
        }}>
        {props.value}
      </Text>
    </View>
  );
};
