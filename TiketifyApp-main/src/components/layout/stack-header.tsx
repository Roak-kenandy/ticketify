import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../constants/colors';
import {spacing} from '../../constants/styles';

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
};

/** Header for screens pushed on the root stack (details, forms). */
const StackHeader = ({title, subtitle, onBack, right}: Props) => (
  <SafeAreaView style={styles.safe}>
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <Icon name="chevron-back" size={22} color={colors.primary} />
      </TouchableOpacity>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  </SafeAreaView>
);

export default StackHeader;

const styles = StyleSheet.create({
  safe: {backgroundColor: colors.primary},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {flex: 1},
  title: {fontSize: 20, fontWeight: '700', color: colors.white},
  subtitle: {fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2},
});
