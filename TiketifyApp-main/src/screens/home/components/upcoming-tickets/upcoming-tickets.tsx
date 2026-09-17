import {FlatList, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../../../../constants/colors';
import TicketCard from '../../../../components/ticket-card';

// Define proper types for better type safety
interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo: string;
  createdAt: string;
  [key: string]: any; // Allow additional properties
}

interface Team {
  id: string;
  name: string;
}

interface TicketsContent {
  content: Ticket[];
  totalElements: number;
}

interface TeamGroup {
  team: Team;
  tickets: TicketsContent;
}

interface Props {
  navigation: any; // TODO: Type this properly with navigation type
  tickets: TeamGroup[] | null | undefined;
}

interface TransformedItem {
  team: Team;
  data: Array<{type: 'header'; name: string} | (Ticket & {type: 'ticket'})>;
}

const UpcomingTickets = (props: Props) => {
  if (!props.tickets || props.tickets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          No upcoming tickets available.
        </Text>
      </View>
    );
  }

  // Transform data with proper error handling
  const transformed: TransformedItem[] = React.useMemo(() => {
    try {
      // Additional safety check for undefined or null tickets
      if (!props.tickets || !Array.isArray(props.tickets)) {
        console.warn('UpcomingTickets: tickets is not an array', props.tickets);
        return [];
      }

      return props.tickets.map((teamGroup: TeamGroup) => {
        // Validate that required properties exist
        if (!teamGroup || !teamGroup.team || !teamGroup.team.name) {
          console.warn('UpcomingTickets: Invalid team data', teamGroup);
          return {
            team: { id: 'unknown', name: 'Unknown Team' },
            data: [{ type: 'header' as const, name: 'Unknown Team' }]
          };
        }

        if (!teamGroup.tickets || !Array.isArray(teamGroup.tickets.content)) {
          console.warn('UpcomingTickets: Invalid tickets data', teamGroup.tickets);
          return {
            team: teamGroup.team,
            data: [
              { type: 'header' as const, name: teamGroup.team.name },
              // No tickets to display
            ]
          };
        }

        return {
          team: teamGroup.team,
          data: [
            { type: 'header' as const, name: teamGroup.team.name },
            ...teamGroup.tickets.content.map(ticket => ({
              ...ticket,
              type: 'ticket' as const,
            }))
          ]
        };
      });
    } catch (error) {
      console.error('UpcomingTickets: Error transforming data', error);
      return [];
    }
  }, [props.tickets]);
  return (
    <View
      style={{
        gap: 14,
      }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <Text style={[{fontSize: 18, fontWeight: 'bold', color: colors.black}]}>
          Team Tickets
        </Text>
      </View>

      <FlatList
        contentContainerStyle={{gap: 10}}
        data={transformed}
        keyExtractor={(item, index) => item.team?.id || `team-${index}`}
        renderItem={({item}) => (
          <FlatList
            data={item.data}
            keyExtractor={(subItem, subIndex) => {
              if (subItem.type === 'header') {
                return `header-${item.team.id}`;
              }
              return subItem.id || `ticket-${subIndex}`;
            }}
            stickyHeaderIndices={[0]} // Header is first
            renderItem={({item: subItem}) =>
              subItem.type === 'header' ? (
                <View style={styles.headerContainer}>
                  <Text style={styles.headerText}>
                    {subItem.name}
                  </Text>
                </View>
              ) : (
                <TicketCard ticket={subItem} navigation={props.navigation} />
              )
            }
          />
        )}
      />
    </View>
  );
};

export default UpcomingTickets;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.primary,
    padding: 20,
    borderRadius: 20,
    gap: 10,
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  emptyContainer: {
    width: '100%',
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  emptyText: {
    color: colors.black,
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  headerContainer: {
    backgroundColor: colors.white,
    paddingHorizontal: 0,
  },
  headerText: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingVertical: 10,
    backgroundColor: colors.white,
    color: colors.black,
  },
  text: {
    color: colors.white,
  },
});
