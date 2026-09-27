import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React from 'react';
import colors from '../../../../constants/colors';
import Icon from 'react-native-vector-icons/Ionicons';
import {useDispatch, useSelector} from 'react-redux';
import {apiFetch, normalizeAvailability} from '../../../../utils/apiClient';
import {showError} from '../../../../utils/notify';
import {spacing} from '../../../../constants/styles';
import PresenceBusyModal from './presence-busy.modal';

type Presence = 'ONLINE' | 'BUSY' | 'OFFLINE';

type Props = {
  navigation: any;
};

function getInitials(name?: string) {
  if (!name) {
    return '?';
  }
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function presenceFromUser(user: any, isOnline: boolean): Presence {
  const p = user?.presence;
  if (p === 'ONLINE' || p === 'BUSY' || p === 'OFFLINE') {
    return p;
  }
  return isOnline ? 'ONLINE' : 'OFFLINE';
}

const PRESENCE_META: Record<
  Presence,
  {label: string; color: string; ring: string}
> = {
  ONLINE: {label: 'Green', color: '#22C55E', ring: '#86EFAC'},
  BUSY: {label: 'Yellow', color: '#EAB308', ring: '#FDE047'},
  OFFLINE: {label: 'Red', color: '#EF4444', ring: '#FCA5A5'},
};

const ProfileCard = (props: Props) => {
  const dispatch = useDispatch();
  const token = useSelector((state: any) => state.auth?.token);
  const isOnline = useSelector((state: any) => state.auth?.isOnline);
  const user = useSelector((state: any) => state.auth?.user);
  const requestRef = React.useRef(0);
  const [busyModal, setBusyModal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const presence = presenceFromUser(user, isOnline);

  const applyPresence = React.useCallback(
    async (next: Presence, busyComment?: string) => {
      if (!token) {
        return;
      }
      const previous = presence;
      if (previous === next && next !== 'BUSY') {
        return;
      }

      const requestId = ++requestRef.current;
      const optimisticOnline = next === 'ONLINE';
      dispatch({
        type: 'USER_PRESENCE',
        payload: {
          presence: next,
          availability: optimisticOnline,
          busy_comment: next === 'BUSY' ? busyComment : null,
        },
      });

      setSubmitting(true);
      try {
        const body: Record<string, string> = {presence: next};
        if (next === 'BUSY' && busyComment) {
          body.busy_comment = busyComment;
        }
        const {data, response} = await apiFetch('/users/presence', token, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        });
        if (requestId !== requestRef.current) {
          return;
        }
        if (!response.ok) {
          throw new Error(data?.message || 'Could not update status');
        }
        dispatch({
          type: 'USER_PRESENCE',
          payload: {
            presence: data.presence ?? next,
            availability: normalizeAvailability(data?.availability),
            busy_comment: data.busy_comment,
            user: data,
          },
        });
      } catch (error: any) {
        if (requestId !== requestRef.current) {
          return;
        }
        dispatch({
          type: 'USER_PRESENCE',
          payload: {
            presence: previous,
            availability: previous === 'ONLINE',
          },
        });
        showError(error?.message || 'Could not update status');
      } finally {
        if (requestId === requestRef.current) {
          setSubmitting(false);
        }
      }
    },
    [dispatch, presence, token],
  );

  const onSelectPresence = (next: Presence) => {
    if (submitting) {
      return;
    }
    if (next === 'BUSY') {
      setBusyModal(true);
      return;
    }
    void applyPresence(next);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.left}>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => props.navigation.openDrawer()}
            activeOpacity={0.8}>
            <Icon name="menu-outline" size={26} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>

          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.name ?? 'Technician'}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>

        <View style={styles.statusWrap}>
          <Text style={styles.statusCaption}>Availability</Text>
          <View style={styles.presenceRow}>
            {(['ONLINE', 'BUSY', 'OFFLINE'] as Presence[]).map(key => {
              const meta = PRESENCE_META[key];
              const active = presence === key;
              return (
                <TouchableOpacity
                  key={key}
                  accessibilityLabel={meta.label}
                  onPress={() => onSelectPresence(key)}
                  style={[
                    styles.presenceDot,
                    {
                      backgroundColor: meta.color,
                      borderColor: active ? meta.ring : 'transparent',
                    },
                    active && styles.presenceDotActive,
                  ]}
                />
              );
            })}
          </View>
          <Text style={styles.statusLabel}>
            {PRESENCE_META[presence].label}
          </Text>
        </View>
      </View>

      <PresenceBusyModal
        visible={busyModal}
        onClose={() => setBusyModal(false)}
        loading={submitting}
        onConfirm={comment => {
          setBusyModal(false);
          void applyPresence('BUSY', comment);
        }}
      />
    </SafeAreaView>
  );
};

export default React.memo(ProfileCard);

const styles = StyleSheet.create({
  safe: {backgroundColor: colors.primary},
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.primary,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    marginRight: spacing.sm,
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  meta: {flex: 1},
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  email: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  statusWrap: {
    alignItems: 'center',
    gap: 4,
  },
  statusCaption: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presenceRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  presenceDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
  },
  presenceDotActive: {
    transform: [{scale: 1.12}],
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8FAFC',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
