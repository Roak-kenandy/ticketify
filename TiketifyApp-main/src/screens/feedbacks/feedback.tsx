import moment from 'moment';
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../constants/colors';
import {radius, shadows, spacing} from '../../constants/styles';

type Props = {
  navigation: any;
  data: {
    feedback?: {feedback?: string; rating?: number; created_at?: string};
    ticket?: {
      id?: string;
      number?: string;
      contact?: {person_name?: {full_name?: string}};
    };
  };
};

const FeedBack = ({navigation, data}: Props) => {
  const rating = Math.max(0, Math.min(5, Number(data?.feedback?.rating) || 0));
  const ticket = data?.ticket;

  return (
    <Pressable
      style={({pressed}) => [styles.card, pressed && styles.pressed]}
      disabled={!ticket?.id}
      onPress={() => navigation.navigate('ActivityDetailsScreen', {ticket})}
      accessibilityRole="button"
      accessibilityLabel={`${rating} star review for ticket ${
        ticket?.number ?? ''
      }`}>
      <View style={styles.row}>
        <View style={styles.stars}>
          {[0, 1, 2, 3, 4].map(i => (
            <Icon
              key={i}
              name={i < rating ? 'star' : 'star-outline'}
              size={18}
              color={i < rating ? colors.secondary : colors.bordergray}
            />
          ))}
        </View>
        <Text style={styles.date}>
          {data?.feedback?.created_at
            ? moment(data.feedback.created_at).format('DD MMM YYYY')
            : ''}
        </Text>
      </View>

      {data?.feedback?.feedback ? (
        <Text style={styles.review}>“{data.feedback.feedback}”</Text>
      ) : null}

      <View style={[styles.row, styles.footer]}>
        <View style={styles.who}>
          <Icon name="person-outline" size={14} color={colors.gray2} />
          <Text style={styles.meta} numberOfLines={1}>
            {ticket?.contact?.person_name?.full_name || 'Customer'}
          </Text>
        </View>
        <View style={styles.who}>
          <Text style={styles.ticket}>#{ticket?.number ?? '—'}</Text>
          <Icon name="chevron-forward" size={16} color={colors.gray3} />
        </View>
      </View>
    </Pressable>
  );
};

export default React.memo(FeedBack);

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
  pressed: {opacity: 0.92},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stars: {flexDirection: 'row', gap: 2},
  date: {fontSize: 12, color: colors.gray2},
  review: {fontSize: 15, color: colors.black, lineHeight: 21},
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  who: {flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1},
  meta: {fontSize: 13, color: colors.gray2, flexShrink: 1},
  ticket: {fontSize: 13, fontWeight: '700', color: colors.primary},
});
