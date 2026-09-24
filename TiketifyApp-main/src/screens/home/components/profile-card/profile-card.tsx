import {
  SafeAreaView,
  StyleSheet,
  Switch,
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

const ProfileCard = (props: Props) => {
  const dispatch = useDispatch();
  const token = useSelector((state: any) => state.auth?.token);
  const isOnline = useSelector((state: any) => state.auth?.isOnline);
  const user = useSelector((state: any) => state.auth?.user);
  const requestRef = React.useRef(0);

  const changeAvailability = React.useCallback(
    (nextOnline: boolean) => {
      if (!token) {
        return;
      }

      const previousOnline = isOnline;
      if (previousOnline === nextOnline) {
        return;
      }

      const requestId = ++requestRef.current;
      const nextStatus = nextOnline ? 'AVAILABLE' : 'UNAVAILABLE';

      dispatch({type: 'USER_STATUS', payload: nextOnline});

      apiFetch(`/users/status?status=${nextStatus}`, token, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
      })
        .then(({data, response}) => {
          if (requestId !== requestRef.current) {
            return;
          }
          if (!response.ok) {
            throw new Error(data?.message || 'Could not update availability');
          }
          dispatch({
            type: 'USER_STATUS',
            payload: normalizeAvailability(data?.availability ?? nextOnline),
          });
        })
        .catch((error: any) => {
          if (requestId !== requestRef.current) {
            return;
          }
          dispatch({type: 'USER_STATUS', payload: previousOnline});
          showError(error?.message || 'Could not update availability');
        });
    },
    [dispatch, isOnline, token],
  );

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
          <Text style={[styles.statusLabel, isOnline && styles.statusOnline]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={changeAvailability}
            trackColor={{false: '#475569', true: '#22C55E'}}
            thumbColor={colors.white}
            ios_backgroundColor="#475569"
          />
        </View>
      </View>
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
    gap: 6,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusOnline: {
    color: '#86EFAC',
  },
});
