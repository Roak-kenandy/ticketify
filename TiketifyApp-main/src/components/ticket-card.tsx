import {Pressable, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../constants/colors';
import {radius, shadows, spacing} from '../constants/styles';
import Icon from 'react-native-vector-icons/Ionicons';
import moment from 'moment';

type Props = {
  navigation: any;
  ticket: any;
};

const stateMeta = (state: string) => {
  if (state === 'IN_PROGRESS') {
    return {label: 'In Progress', color: colors.success, bg: colors.successBg};
  }
  if (state === 'CLOSED') {
    return {label: 'Completed', color: colors.warning, bg: colors.warningBg};
  }
  return {label: 'Assigned', color: colors.primary, bg: colors.tertiary};
};

const priorityMeta = (priority: string) => {
  if (priority === 'URGENT') {
    return {color: colors.error, bg: colors.errorBg};
  }
  if (priority === 'MEDIUM') {
    return {color: colors.warning, bg: colors.warningBg};
  }
  return {color: colors.info, bg: colors.infoBg};
};

const TicketCard = (props: Props) => {
  const state = stateMeta(props.ticket.state);
  const priority = priorityMeta(props.ticket.priority);

  return (
    <Pressable
      onPress={() =>
        props.navigation.navigate('ActivityDetailsScreen', {
          ticket: props.ticket,
        })
      }
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Icon name="document-text-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.number}>{props.ticket.number}</Text>
            <Icon name="chevron-forward" size={18} color={colors.gray3} />
          </View>
          <Text style={styles.queue} numberOfLines={1}>
            {props.ticket.queue?.name || 'No queue'}
          </Text>
        </View>
      </View>

      <Text style={styles.description} numberOfLines={2}>
        {props.ticket.description || 'No description'}
      </Text>

      <View style={styles.badges}>
        <View style={[styles.badge, {backgroundColor: priority.bg}]}>
          <Text style={[styles.badgeText, {color: priority.color}]}>
            {props.ticket.priority}
          </Text>
        </View>
        <View style={[styles.badge, {backgroundColor: state.bg}]}>
          <Text style={[styles.badgeText, {color: state.color}]}>
            {state.label}
          </Text>
        </View>
        {props.ticket.stage?.name ? (
          <View style={[styles.badge, styles.stageBadge]}>
            <Text style={[styles.badgeText, {color: colors.primary}]}>
              {props.ticket.stage.name}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.meta} numberOfLines={1}>
          {props.ticket.contact?.name || 'No contact'}
        </Text>
        <Text style={styles.meta}>
          {moment(props.ticket.creation_date * 1000).format('DD MMM YYYY')}
        </Text>
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
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  main: {flex: 1},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  number: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.black,
  },
  queue: {
    fontSize: 12,
    color: colors.gray2,
    marginTop: 2,
  },
  description: {
    fontSize: 14,
    color: colors.black,
    lineHeight: 20,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stageBadge: {
    backgroundColor: colors.surface,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  meta: {
    fontSize: 12,
    color: colors.gray2,
    flex: 1,
  },
});
