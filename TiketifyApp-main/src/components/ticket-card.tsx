import {Pressable, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../constants/colors';
import {radius, shadows, spacing} from '../constants/styles';
import Icon from 'react-native-vector-icons/Ionicons';
import moment from 'moment';
import {priorityMeta, ticketStateMeta} from '../constants/ticket-meta';
import {ToneBadge} from './ui/badge';

type Props = {
  navigation: any;
  ticket: any;
  /** Hide the state pill where the list is already grouped by state. */
  hideState?: boolean;
};

const TicketCard = (props: Props) => {
  const {ticket} = props;
  const state = ticketStateMeta(ticket.state);
  const priority = priorityMeta(ticket.priority);
  const created = ticket.creation_date
    ? moment(ticket.creation_date * 1000)
    : null;

  return (
    <Pressable
      onPress={() =>
        props.navigation.navigate('ActivityDetailsScreen', {ticket})
      }
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.number ?? ''}, ${state.label}`}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, {backgroundColor: state.bg}]}>
          <Icon name={state.icon} size={20} color={state.color} />
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.number} numberOfLines={1}>
              {ticket.number ? `#${ticket.number}` : 'Ticket'}
            </Text>
            <Icon name="chevron-forward" size={18} color={colors.gray3} />
          </View>
          <Text style={styles.queue} numberOfLines={1}>
            {ticket.queue?.name || 'No queue'}
          </Text>
        </View>
      </View>

      {ticket.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {ticket.description}
        </Text>
      ) : null}

      <View style={styles.badges}>
        <ToneBadge tone={priority} size="sm" showIcon />
        {!props.hideState ? <ToneBadge tone={state} size="sm" /> : null}
        {ticket.stage?.name ? (
          <ToneBadge
            tone={{
              label: ticket.stage.name,
              color: colors.primary,
              bg: colors.surface,
              icon: 'flag-outline',
            }}
            size="sm"
          />
        ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.metaItem}>
          <Icon name="person-outline" size={13} color={colors.gray3} />
          <Text style={styles.meta} numberOfLines={1}>
            {ticket.contact?.name || 'No contact'}
          </Text>
        </View>
        {created ? (
          <View style={styles.metaItemRight}>
            <Icon name="calendar-outline" size={13} color={colors.gray3} />
            <Text style={styles.metaRight}>
              {created.format('DD MMM YYYY')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

export default React.memo(TicketCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  cardPressed: {opacity: 0.92, transform: [{scale: 0.995}]},
  topRow: {flexDirection: 'row', gap: spacing.md, alignItems: 'center'},
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  main: {flex: 1},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  number: {fontSize: 16, fontWeight: '700', color: colors.black, flex: 1},
  queue: {fontSize: 12, color: colors.gray2, marginTop: 2},
  description: {fontSize: 14, color: colors.black, lineHeight: 20},
  badges: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
  },
  metaItem: {flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1},
  metaItemRight: {flexDirection: 'row', alignItems: 'center', gap: 4},
  meta: {fontSize: 12, color: colors.gray2, flex: 1},
  metaRight: {fontSize: 12, color: colors.gray2},
});
