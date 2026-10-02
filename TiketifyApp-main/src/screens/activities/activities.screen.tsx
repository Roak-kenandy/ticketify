import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import React, {useMemo} from 'react';
import {FlatList, RefreshControl, StyleSheet, View} from 'react-native';
import {useSelector} from 'react-redux';
import ScreenHeader from '../../components/layout/screen-header';
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
import {showError} from '../../utils/notify';

const Tab = createMaterialTopTabNavigator();

type Props = {
  navigation: any;
};

type ListContext = {
  loaded: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  navigation: any;
};

const ListContextValue = React.createContext<ListContext | null>(null);

type TabProps = {
  tickets: any[];
  emptyIcon: string;
  emptyTitle: string;
  emptyMessage: string;
};

const Separator = () => <View style={styles.separator} />;

function TicketListTab({
  tickets,
  emptyIcon,
  emptyTitle,
  emptyMessage,
}: TabProps) {
  const ctx = React.useContext(ListContextValue)!;

  let empty: React.ReactElement;
  if (!ctx.loaded && !ctx.error) {
    empty = (
      <View style={styles.skeletons}>
        <TicketCardSkeleton />
        <TicketCardSkeleton />
      </View>
    );
  } else if (!ctx.loaded && ctx.error) {
    empty = <ErrorState message={ctx.error} onRetry={ctx.onRefresh} />;
  } else {
    empty = (
      <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={tickets}
      keyExtractor={(item: any, index) => String(item?.id ?? index)}
      renderItem={({item}) => (
        <TicketCard ticket={item} navigation={ctx.navigation} hideState />
      )}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        ctx.loaded && ctx.error ? (
          <View style={styles.banner}>
            <InlineBanner
              tone="error"
              message={ctx.error}
              actionLabel="Retry"
              onAction={ctx.onRefresh}
            />
          </View>
        ) : null
      }
      ListEmptyComponent={empty}
      initialNumToRender={8}
      windowSize={7}
      refreshControl={
        <RefreshControl
          refreshing={ctx.refreshing}
          onRefresh={ctx.onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    />
  );
}

const ActivityScreen = ({navigation}: Props) => {
  const tickets = useSelector((state: any) => state.global.tickets);
  const syncedAt = useSelector((state: any) => state.global.tickets_synced_at);
  const syncError = useSelector((state: any) => state.global.tickets_error);
  const [refreshing, setRefreshing] = React.useState(false);
  const {refreshAllData} = useAppData('tickets');

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

  const groups = useMemo(() => {
    const list: any[] = Array.isArray(tickets) ? tickets : [];
    return {
      NEW: list.filter(t => t.state === 'NEW'),
      IN_PROGRESS: list.filter(t => t.state === 'IN_PROGRESS'),
      CLOSED: list.filter(t => t.state === 'CLOSED'),
    };
  }, [tickets]);

  const ctx = useMemo<ListContext>(
    () => ({
      loaded: syncedAt != null,
      error: syncError,
      refreshing,
      onRefresh,
      navigation,
    }),
    [syncedAt, syncError, refreshing, onRefresh, navigation],
  );

  const label = (title: string, count: number) =>
    syncedAt != null ? `${title} (${count})` : title;

  return (
    <ListContextValue.Provider value={ctx}>
      <View style={styles.screen}>
        <ScreenHeader
          title="My tickets"
          subtitle="Pull down to refresh"
          onMenuPress={() => navigation.openDrawer()}
        />

        <View style={styles.tabsWrap}>
          <Tab.Navigator
            sceneContainerStyle={styles.scene}
            screenOptions={{
              tabBarScrollEnabled: false,
              tabBarItemStyle: styles.tabItem,
              tabBarContentContainerStyle: styles.tabBarContent,
              tabBarStyle: styles.tabBar,
              tabBarIndicatorStyle: styles.tabIndicator,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.gray2,
              tabBarLabelStyle: styles.tabLabel,
              tabBarPressColor: colors.tertiary,
              lazy: true,
            }}>
            <Tab.Screen
              name="Assigned"
              options={{tabBarLabel: label('Assigned', groups.NEW.length)}}>
              {() => (
                <TicketListTab
                  tickets={groups.NEW}
                  emptyIcon="mail-open-outline"
                  emptyTitle="Nothing assigned"
                  emptyMessage="Tickets you pick up or are given will appear here."
                />
              )}
            </Tab.Screen>
            <Tab.Screen
              name="In Progress"
              options={{
                tabBarLabel: label('Active', groups.IN_PROGRESS.length),
              }}>
              {() => (
                <TicketListTab
                  tickets={groups.IN_PROGRESS}
                  emptyIcon="construct-outline"
                  emptyTitle="No active work"
                  emptyMessage="Start an assigned ticket to see it here."
                />
              )}
            </Tab.Screen>
            <Tab.Screen
              name="Completed"
              options={{tabBarLabel: label('Closed', groups.CLOSED.length)}}>
              {() => (
                <TicketListTab
                  tickets={groups.CLOSED}
                  emptyIcon="checkmark-done-outline"
                  emptyTitle="No closed tickets"
                  emptyMessage="Your 50 most recent closed tickets are shown here."
                />
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </View>
      </View>
    </ListContextValue.Provider>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  scene: {backgroundColor: colors.surface},
  tabsWrap: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  tabBar: {
    backgroundColor: colors.white,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tabBarContent: {flex: 1},
  tabItem: {flex: 1, width: undefined, minHeight: 48},
  tabLabel: {fontSize: 13, fontWeight: '700', textTransform: 'none'},
  tabIndicator: {backgroundColor: colors.primary, height: 3, borderRadius: 3},
  listContent: {padding: spacing.md, paddingBottom: spacing.xxxl, flexGrow: 1},
  separator: {height: spacing.sm},
  skeletons: {gap: spacing.sm},
  banner: {marginBottom: spacing.sm},
});
