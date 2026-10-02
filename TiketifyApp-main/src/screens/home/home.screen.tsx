import moment from 'moment';
import React from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSelector} from 'react-redux';
import TicketCard from '../../components/ticket-card';
import {
  EmptyState,
  ErrorState,
  InlineBanner,
  TicketCardSkeleton,
} from '../../components/ui/state-views';
import colors from '../../constants/colors';
import {radius, spacing} from '../../constants/styles';
import {useAppData} from '../../hooks/useAppData';
import {teamTicketList} from '../../services/ticketsSync';
import {isOnShift} from '../../store/reducers/auth.reducer';
import {showError} from '../../utils/notify';
import ProfileCard from './components/profile-card/profile-card';
import StatsCard from './components/stats-card/stats-card';

type Props = {
  navigation: any;
};

function matchesQuery(ticket: any, query: string) {
  if (!query) {
    return true;
  }
  return [
    ticket?.number,
    ticket?.id,
    ticket?.contact?.name,
    ticket?.description,
  ]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(query));
}

const HomeScreen = ({navigation}: Props) => {
  const onShift = useSelector((state: any) => isOnShift(state.auth));
  const tickets = useSelector((state: any) => state.global.tickets);
  const teamGroups = useSelector((state: any) => state.global.team_tickets);
  const syncedAt = useSelector((state: any) => state.global.tickets_synced_at);
  const syncError = useSelector((state: any) => state.global.tickets_error);
  const [refreshing, setRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');
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

  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (Array.isArray(teamGroups) ? teamGroups : [])
      .filter((group: any) => group?.team?.name)
      .map((group: any) => ({
        key: String(group.team.id ?? group.team.name),
        title: group.team.name as string,
        unavailable: Boolean(group.error),
        data: teamTicketList(group).filter(ticket => matchesQuery(ticket, q)),
      }))
      .filter(
        section => section.data.length > 0 || (!q && section.unavailable),
      );
  }, [teamGroups, query]);

  const loaded = syncedAt != null;

  const header = (
    <View style={styles.header}>
      {!onShift ? (
        <InlineBanner
          icon="moon-outline"
          message="You're Offline. Switch to Available to receive jobs and share your location."
        />
      ) : null}
      {loaded && syncError ? (
        <InlineBanner
          tone="error"
          message={syncError}
          actionLabel="Retry"
          onAction={onRefresh}
        />
      ) : null}

      <StatsCard navigation={navigation} tickets={tickets} loading={!loaded} />

      <View style={styles.sectionIntro}>
        <View style={styles.flex}>
          <Text style={styles.title}>Team queue</Text>
          <Text style={styles.subtitle}>
            New tickets across your teams
            {syncedAt ? ` · updated ${moment(syncedAt).format('h:mm A')}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={18} color={colors.gray3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search ticket number, customer or text"
          placeholderTextColor={colors.gray3}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityLabel="Clear search">
            <Icon name="close-circle" size={18} color={colors.gray3} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  let empty: React.ReactElement;
  if (!loaded && !syncError) {
    empty = (
      <View style={styles.skeletons}>
        <TicketCardSkeleton />
        <TicketCardSkeleton />
        <TicketCardSkeleton />
      </View>
    );
  } else if (!loaded && syncError) {
    empty = <ErrorState message={syncError} onRetry={onRefresh} />;
  } else if (query.trim()) {
    empty = (
      <EmptyState
        icon="search-outline"
        title="No matches"
        message="Try a different ticket number or customer name."
      />
    );
  } else {
    empty = (
      <EmptyState
        icon="checkmark-done-circle-outline"
        title="Queue is clear"
        message="There are no new tickets in your teams right now."
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ProfileCard navigation={navigation} />
      <SectionList
        sections={sections}
        keyExtractor={(item: any, index) => String(item?.id ?? index)}
        renderItem={({item}) => (
          <TicketCard ticket={item} navigation={navigation} />
        )}
        renderSectionHeader={({section}) => (
          <View style={styles.teamHeader}>
            <Text style={styles.teamName}>{section.title}</Text>
            <Text style={styles.teamCount}>
              {section.unavailable ? 'Unavailable' : section.data.length}
            </Text>
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Separator}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        initialNumToRender={6}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
};

const Separator = () => <View style={styles.separator} />;

export default HomeScreen;

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  flex: {flex: 1},
  content: {padding: spacing.lg, paddingBottom: spacing.xxxl * 2},
  header: {gap: spacing.lg, marginBottom: spacing.sm},
  sectionIntro: {flexDirection: 'row', alignItems: 'flex-end'},
  title: {fontSize: 18, fontWeight: '700', color: colors.black},
  subtitle: {fontSize: 13, color: colors.gray2, marginTop: 2},
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
  },
  searchInput: {flex: 1, height: 46, color: colors.black, fontSize: 14},
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  teamCount: {fontSize: 12, fontWeight: '600', color: colors.gray2},
  separator: {height: spacing.sm},
  skeletons: {gap: spacing.sm, marginTop: spacing.sm},
});
