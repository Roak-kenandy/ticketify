import {Platform, StyleSheet} from 'react-native';
import colors from './colors';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  h1: {fontSize: 28, fontWeight: '700' as const, color: colors.black},
  h2: {fontSize: 22, fontWeight: '700' as const, color: colors.black},
  h3: {fontSize: 18, fontWeight: '600' as const, color: colors.black},
  body: {fontSize: 15, fontWeight: '400' as const, color: colors.black},
  bodySm: {fontSize: 13, fontWeight: '400' as const, color: colors.gray2},
  caption: {fontSize: 12, fontWeight: '500' as const, color: colors.gray2},
  label: {fontSize: 14, fontWeight: '600' as const, color: colors.black},
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    android: {elevation: 3},
  }),
};

export const globalStyles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: '100%',
  },
  inputContainer: {
    width: '100%',
    gap: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'column',
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    width: '100%',
  },
  label: {
    ...typography.label,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    height: 52,
    width: '100%',
    color: colors.black,
    fontSize: 15,
    backgroundColor: colors.white,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  errorBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadows.card,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
});
