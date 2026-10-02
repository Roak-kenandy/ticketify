import React from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useDispatch, useSelector} from 'react-redux';
import {confirmSignOut} from '../../components/drawer/customer-drawer';
import ScreenHeader from '../../components/layout/screen-header';
import {APP_VERSION, SUPPORT_PHONE} from '../../constants/app';
import colors from '../../constants/colors';
import {radius, shadows, spacing, typography} from '../../constants/styles';
import {
  humanize,
  initials,
  PRESENCE_META,
  presenceFromUser,
} from '../../constants/ticket-meta';
import {signOut} from '../../utils/session';

type Props = {
  navigation: any;
};

const AccountScreen = ({navigation}: Props) => {
  const dispatch = useDispatch();
  const user = useSelector((state: any) => state.auth?.user);
  const token = useSelector((state: any) => state.auth?.token);
  const isOnline = useSelector((state: any) => state.auth?.isOnline);
  const [signingOut, setSigningOut] = React.useState(false);
  const presence = PRESENCE_META[presenceFromUser(user, isOnline)];

  const onSignOut = () =>
    confirmSignOut(async () => {
      setSigningOut(true);
      try {
        await signOut(dispatch, token);
      } finally {
        setSigningOut(false);
      }
    });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Account"
        onMenuPress={() => navigation.openDrawer()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.profile]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user?.name)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{user?.name ?? 'Technician'}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
            <View style={[styles.presence, {backgroundColor: presence.bg}]}>
              <View style={[styles.dot, {backgroundColor: presence.color}]} />
              <Text style={[styles.presenceText, {color: presence.color}]}>
                {presence.label}
                {user?.presence === 'BUSY' && user?.busy_comment
                  ? ` · ${user.busy_comment}`
                  : ''}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.groupLabel}>Details</Text>
        <View style={styles.card}>
          <Row icon="mail-outline" label="Email" value={user?.email} />
          <Row
            icon="call-outline"
            label="Phone"
            value={user?.phone ?? user?.mobile}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Role"
            value={user?.role ? humanize(String(user.role)) : undefined}
            last
          />
        </View>

        <Text style={styles.groupLabel}>Security & device</Text>
        <View style={styles.card}>
          <Row
            icon="key-outline"
            label="Change password"
            onPress={() => navigation.navigate('ChangePasswordScreen')}
          />
          <Row
            icon="location-outline"
            label="Location & battery permissions"
            hint="Allow location “All the time” so dispatch can see you while Available or Busy."
            onPress={() => Linking.openSettings()}
            last
          />
        </View>

        <Text style={styles.groupLabel}>Help</Text>
        <View style={styles.card}>
          <Row
            icon="headset-outline"
            label="Call support"
            value={SUPPORT_PHONE}
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
          />
          <Row
            icon="information-circle-outline"
            label="App version"
            value={APP_VERSION}
            last
          />
        </View>

        <TouchableOpacity
          style={styles.signOut}
          onPress={onSignOut}
          disabled={signingOut}
          activeOpacity={0.8}>
          {signingOut ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Icon name="log-out-outline" size={20} color={colors.error} />
          )}
          <Text style={styles.signOutText}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function Row({
  icon,
  label,
  value,
  hint,
  onPress,
  last,
}: {
  icon: string;
  label: string;
  value?: string;
  hint?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Icon name={icon} size={20} color={colors.primary} />
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <Icon name="chevron-forward" size={18} color={colors.gray3} />
      ) : null}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

export default AccountScreen;

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  content: {padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm},
  flex: {flex: 1},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 20, fontWeight: '700', color: colors.primary},
  name: {...typography.h3},
  sub: {...typography.bodySm, marginTop: 2},
  presence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  dot: {width: 8, height: 8, borderRadius: 4},
  presenceText: {fontSize: 12, fontWeight: '700'},
  groupLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowLabel: {fontSize: 15, fontWeight: '500', color: colors.black},
  rowValue: {fontSize: 14, color: colors.gray2, maxWidth: '45%'},
  hint: {fontSize: 12, color: colors.gray2, marginTop: 2, lineHeight: 16},
  signOut: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.errorBg,
  },
  signOutText: {fontSize: 16, fontWeight: '700', color: colors.error},
});
