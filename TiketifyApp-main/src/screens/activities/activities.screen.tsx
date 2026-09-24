import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import React, {useMemo} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import colors from '../../constants/colors';
import {useSelector} from 'react-redux';
import TicketCard from '../../components/ticket-card';
import ScreenHeader from '../../components/layout/screen-header';
import {radius, spacing} from '../../constants/styles';

const Tab = createMaterialTopTabNavigator();

type Props = {
  navigation: any;
};

type TicketListTabProps = {
  tickets: any[];
  navigation: any;
  emptyLabel: string;
};

const TicketListTab = React.memo(
  ({tickets, navigation, emptyLabel}: TicketListTabProps) => (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={tickets}
      keyExtractor={(item: any) => String(item.id ?? item.ticket_id)}
      renderItem={({item}) => (
        <TicketCard ticket={item} navigation={navigation} />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      }
    />
  ),
);

const ActivityScreen = (props: Props) => {
  const tickets = useSelector((state: any) => state.global.tickets) ?? [];

  const assignedTickets = useMemo(
    () => tickets.filter((ticket: any) => ticket.state === 'NEW'),
    [tickets],
  );
  const inProgressTickets = useMemo(
    () => tickets.filter((ticket: any) => ticket.state === 'IN_PROGRESS'),
    [tickets],
  );
  const completedTickets = useMemo(
    () => tickets.filter((ticket: any) => ticket.state === 'CLOSED'),
    [tickets],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="My tickets"
        subtitle="Assigned, in progress, and completed"
        onMenuPress={() => props.navigation.openDrawer()}
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
        }}>
        <Tab.Screen name="Assigned">
          {() => (
            <TicketListTab
              tickets={assignedTickets}
              navigation={props.navigation}
              emptyLabel="No assigned tickets"
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="In Progress">
          {() => (
            <TicketListTab
              tickets={inProgressTickets}
              navigation={props.navigation}
              emptyLabel="No tickets in progress"
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Completed">
          {() => (
            <TicketListTab
              tickets={completedTickets}
              navigation={props.navigation}
              emptyLabel="No completed tickets"
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
      </View>
    </View>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scene: {
    backgroundColor: colors.surface,
  },
  tabsWrap: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tabBar: {
    backgroundColor: colors.white,
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tabBarContent: {
    flex: 1,
  },
  tabItem: {
    flex: 1,
    width: undefined,
    minHeight: 48,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'none',
  },
  tabIndicator: {
    backgroundColor: colors.primary,
    height: 3,
    borderRadius: 3,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  empty: {
    padding: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.gray2,
    fontSize: 14,
  },
});
