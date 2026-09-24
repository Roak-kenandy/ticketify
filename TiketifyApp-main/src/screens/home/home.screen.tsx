import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSelector} from 'react-redux';
import colors from '../../constants/colors';
import {spacing} from '../../constants/styles';
import ProfileCard from './components/profile-card/profile-card';
import StatsCard from './components/stats-card/stats-card';
import UpcomingTickets from './components/upcoming-tickets/upcoming-tickets';
import {useAppData} from '../../hooks/useAppData';
import {showError} from '../../utils/notify';

type Props = {
  navigation: any;
};

const HomeScreen = (props: Props) => {
  const isOnline = useSelector((state: any) => state.auth?.isOnline);
  const tickets = useSelector((state: any) => state.global.tickets) ?? [];
  const teamTickets =
    useSelector((state: any) => state.global.team_tickets) ?? [];
  const [refreshing, setRefreshing] = React.useState(false);
  const {refreshAllData} = useAppData('home');

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAllData({silent: false, force: true});
    } catch (error: any) {
      showError(error?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [refreshAllData]);

  return (
    <View style={styles.screen}>
      <StatusBar backgroundColor={colors.primary} barStyle="light-content" />
      <ProfileCard navigation={props.navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Dashboard</Text>
            <Text style={styles.sectionSubtitle}>Your workload at a glance</Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            style={styles.refreshBtn}
            activeOpacity={0.7}>
            <Icon
              name="refresh-outline"
              size={20}
              color={colors.primary}
              style={refreshing ? styles.spinning : undefined}
            />
          </TouchableOpacity>
        </View>

        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Icon name="cloud-offline-outline" size={18} color={colors.warning} />
            <Text style={styles.offlineText}>
              You are offline. Location sync is paused.
            </Text>
          </View>
        )}

        <StatsCard navigation={props.navigation} tickets={tickets} />
        <UpcomingTickets tickets={teamTickets} navigation={props.navigation} />
      </ScrollView>
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {flex: 1},
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.black,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.gray2,
    marginTop: 4,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  spinning: {opacity: 0.5},
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  offlineText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning,
    fontWeight: '500',
  },
});
