import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {DrawerContentScrollView} from '@react-navigation/drawer';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../constants/colors';
import {useDispatch, useSelector} from 'react-redux';
import {spacing} from '../../constants/styles';
import {signOut} from '../../utils/session';
import {SUPPORT_PHONE} from '../../constants/app';
import {initials as getInitials} from '../../constants/ticket-meta';

const NAV_ITEMS = [
  {route: 'Home', label: 'Dashboard', icon: 'grid-outline'},
  {route: 'My Tickets', label: 'My tickets', icon: 'layers-outline'},
  {route: 'Feedbacks', label: 'Reviews', icon: 'star-outline'},
  {route: 'Account', label: 'Account', icon: 'person-circle-outline'},
] as const;

export function confirmSignOut(onConfirm: () => void) {
  Alert.alert(
    'Sign out?',
    "You'll be marked offline and stop receiving job notifications on this device.",
    [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Sign out', style: 'destructive', onPress: onConfirm},
    ],
  );
}

const CustomDrawer = (props: any) => {
  const dispatch = useDispatch();
  const user = useSelector((state: any) => state.auth.user);
  const token = useSelector((state: any) => state.auth.token);
  const activeRoute = props.state.routeNames[props.state.index];
  const [signingOut, setSigningOut] = React.useState(false);

  return (
    <View style={styles.root}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? 'Technician'}</Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email ?? ''}
          </Text>
        </View>

        <View style={styles.menu}>
          {NAV_ITEMS.map(item => {
            const focused = activeRoute === item.route;
            return (
              <TouchableOpacity
                key={item.route}
                style={[styles.navItem, focused && styles.navItemActive]}
                activeOpacity={0.75}
                onPress={() => props.navigation.navigate(item.route)}>
                <Icon
                  name={item.icon}
                  size={22}
                  color={focused ? colors.primary : colors.gray2}
                  style={styles.navIcon}
                />
                <Text
                  style={[styles.navLabel, focused && styles.navLabelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <DrawerAction
          icon="key-outline"
          label="Change password"
          onPress={() => props.navigation.navigate('ChangePasswordScreen')}
        />
        <DrawerAction
          icon="call-outline"
          label="Contact support"
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
        />
        <DrawerAction
          icon="log-out-outline"
          label={signingOut ? 'Signing out…' : 'Sign out'}
          danger
          loading={signingOut}
          onPress={() =>
            confirmSignOut(async () => {
              setSigningOut(true);
              try {
                await signOut(dispatch, token);
              } finally {
                setSigningOut(false);
              }
            })
          }
        />
      </View>
    </View>
  );
};

function DrawerAction({
  icon,
  label,
  onPress,
  danger,
  loading,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const tint = danger ? colors.error : colors.gray2;
  return (
    <TouchableOpacity
      style={styles.action}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={tint}
          style={styles.actionIcon}
        />
      ) : (
        <Icon name={icon} size={20} color={tint} style={styles.actionIcon} />
      )}
      <Text style={[styles.actionText, danger && styles.actionDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default CustomDrawer;

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  scrollContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  header: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  email: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  menu: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: colors.tertiary,
  },
  navIcon: {
    width: 28,
    textAlign: 'center',
  },
  navLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray2,
    marginLeft: spacing.md,
  },
  navLabelActive: {
    color: colors.primary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  actionIcon: {
    width: 28,
    textAlign: 'center',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.black,
    marginLeft: spacing.md,
  },
  actionDanger: {color: colors.error},
});
