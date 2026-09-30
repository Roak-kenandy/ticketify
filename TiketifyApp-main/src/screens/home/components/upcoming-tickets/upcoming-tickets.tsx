import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import React from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';
import TicketCard from '../../../../components/ticket-card';

interface Props {
  navigation: any;
  tickets: any[] | null | undefined;
}

const matchesServiceRequestId = (ticket: any, query: string) => {
  const value = query.trim().toLowerCase();
  if (!value) {
    return true;
  }
  const number = String(ticket?.number ?? '').toLowerCase();
  const id = String(ticket?.id ?? ticket?.ticket_id ?? '').toLowerCase();
  return number.includes(value) || id.includes(value);
};

const UpcomingTickets = (props: Props) => {
  const [query, setQuery] = React.useState('');

  const teamGroups = React.useMemo(() => {
    if (!props.tickets || !Array.isArray(props.tickets)) {
      return [];
    }

    return props.tickets
      .filter(teamGroup => teamGroup?.team?.name)
      .map(teamGroup => ({
        team: teamGroup.team,
        tickets: (Array.isArray(teamGroup.tickets?.content)
          ? teamGroup.tickets.content
          : []
        ).filter((ticket: any) => matchesServiceRequestId(ticket, query)),
      }))
      .filter(teamGroup => teamGroup.tickets.length > 0 || !query.trim());
  }, [props.tickets, query]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Team tickets</Text>
      <Text style={styles.subtitle}>Open assignments across your teams</Text>

      <View style={styles.searchWrap}>
        <Icon name="search-outline" size={18} color={colors.gray3} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by service request id"
          placeholderTextColor={colors.gray3}
          autoCapitalize="none"
          autoCorrect={false}
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

      {teamGroups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {query.trim()
              ? 'No tickets match this service request id'
              : 'No team tickets right now'}
          </Text>
        </View>
      ) : (
        teamGroups.map(teamGroup => (
          <View key={teamGroup.team.id ?? teamGroup.team.name} style={styles.group}>
            <Text style={styles.teamName}>{teamGroup.team.name}</Text>
            {teamGroup.tickets.length === 0 ? (
              <Text style={styles.emptyTeam}>No tickets in this team</Text>
            ) : (
              teamGroup.tickets.map(ticket => (
                <TicketCard
                  key={String(ticket.id ?? ticket.ticket_id)}
                  ticket={ticket}
                  navigation={props.navigation}
                />
              ))
            )}
          </View>
        ))
      )}
    </View>
  );
};

export default UpcomingTickets;

const styles = StyleSheet.create({
  wrap: {gap: spacing.md},
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.black,
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray2,
    marginTop: -4,
    marginBottom: spacing.xs,
  },
  group: {gap: spacing.sm, marginTop: spacing.sm},
  teamName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  empty: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyText: {
    color: colors.gray2,
    fontSize: 14,
  },
  emptyTeam: {
    color: colors.gray3,
    fontSize: 13,
    paddingVertical: spacing.sm,
  },
  searchWrap: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 46,
    color: colors.black,
    fontSize: 14,
  },
});
