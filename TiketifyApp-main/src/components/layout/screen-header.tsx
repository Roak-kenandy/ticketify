import React from 'react';
import {SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../constants/colors';
import {spacing} from '../../constants/styles';

type Props = {
  title: string;
  subtitle?: string;
  onMenuPress: () => void;
};

const ScreenHeader = ({title, subtitle, onMenuPress}: Props) => (
  <SafeAreaView style={styles.safe}>
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.menuBtn}
        onPress={onMenuPress}
        activeOpacity={0.8}>
        <Icon name="menu-outline" size={24} color={colors.primary} />
      </TouchableOpacity>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  </SafeAreaView>
);

export default ScreenHeader;

const styles = StyleSheet.create({
  safe: {backgroundColor: colors.primary},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {flex: 1},
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
