import React from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../constants/colors';
import {radius, spacing, typography} from '../../constants/styles';

type EmptyProps = {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  compact?: boolean;
};

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
  style,
  compact,
}: EmptyProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={compact ? 22 : 28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onAction}
          activeOpacity={0.8}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  style,
  compact,
}: {
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this"
      message={message || 'Check your connection and try again.'}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
      style={style}
      compact={compact}
    />
  );
}

export function InlineBanner({
  tone = 'warning',
  icon,
  message,
  actionLabel,
  onAction,
}: {
  tone?: 'warning' | 'error' | 'info';
  icon?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette =
    tone === 'error'
      ? {fg: colors.error, bg: colors.errorBg}
      : tone === 'info'
      ? {fg: colors.info, bg: colors.infoBg}
      : {fg: colors.warning, bg: colors.warningBg};
  return (
    <View style={[styles.banner, {backgroundColor: palette.bg}]}>
      <Icon
        name={
          icon ??
          (tone === 'info'
            ? 'information-circle-outline'
            : 'alert-circle-outline')
        }
        size={18}
        color={palette.fg}
      />
      <Text style={[styles.bannerText, {color: palette.fg}]}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={[styles.bannerAction, {color: palette.fg}]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function LoadingState({label}: {label?: string}) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={styles.message}>{label}</Text> : null}
    </View>
  );
}

/** Pulsing placeholder block for skeleton layouts. */
export function Skeleton({
  width = '100%',
  height = 14,
  style,
  rounded,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
  rounded?: boolean;
}) {
  const opacity = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          opacity,
          borderRadius: rounded ? height / 2 : radius.sm,
        },
        style,
      ]}
    />
  );
}

export function TicketCardSkeleton() {
  return (
    <View style={styles.cardSkeleton}>
      <View style={styles.row}>
        <Skeleton width={44} height={44} style={styles.skeletonIcon} />
        <View style={styles.flex}>
          <Skeleton width="45%" height={16} />
          <Skeleton width="65%" height={12} style={styles.mt8} />
        </View>
      </View>
      <Skeleton height={12} style={styles.mtMd} />
      <Skeleton width="80%" height={12} style={styles.mt6} />
      <View style={[styles.row, styles.mtMd]}>
        <Skeleton width={64} height={22} rounded />
        <Skeleton width={84} height={22} rounded />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  wrapCompact: {paddingVertical: spacing.xl},
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {...typography.h3, fontSize: 16, textAlign: 'center'},
  message: {...typography.bodySm, textAlign: 'center', lineHeight: 19},
  action: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  actionText: {color: colors.white, fontWeight: '600', fontSize: 14},
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  bannerText: {flex: 1, fontSize: 13, fontWeight: '500'},
  bannerAction: {fontSize: 13, fontWeight: '700'},
  skeleton: {backgroundColor: '#E6EAF2'},
  cardSkeleton: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: {flexDirection: 'row', gap: spacing.md, alignItems: 'center'},
  flex: {flex: 1},
  skeletonIcon: {borderRadius: 12},
  mt6: {marginTop: 6},
  mt8: {marginTop: 8},
  mtMd: {marginTop: spacing.md},
});
