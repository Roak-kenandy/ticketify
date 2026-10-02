import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity} from 'react-native';
import moment from 'moment';
import colors from '../../constants/colors';
import {radius, spacing} from '../../constants/styles';

type ChipProps = {
  label: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
};

function Chip({label, sub, active, onPress, disabled}: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{selected: active, disabled}}
      style={[
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
      ]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
      {sub ? (
        <Text style={[styles.chipSub, active && styles.chipLabelActive]}>
          {sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/** Horizontal day picker: Today, Tomorrow, then weekday chips. Value is YYYY-MM-DD. */
export function DateChips({
  value,
  onChange,
  days = 10,
  includePast = 0,
}: {
  value: string;
  onChange: (date: string) => void;
  days?: number;
  includePast?: number;
}) {
  const options = React.useMemo(() => {
    const start = moment().startOf('day').subtract(includePast, 'days');
    return Array.from({length: days + includePast}, (_, i) => {
      const day = start.clone().add(i, 'days');
      const diff = day.diff(moment().startOf('day'), 'days');
      const label =
        diff === 0
          ? 'Today'
          : diff === 1
          ? 'Tomorrow'
          : diff === -1
          ? 'Yesterday'
          : day.format('ddd');
      return {key: day.format('YYYY-MM-DD'), label, sub: day.format('D MMM')};
    });
  }, [days, includePast]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {options.map(option => (
        <Chip
          key={option.key}
          label={option.label}
          sub={option.sub}
          active={value === option.key}
          onPress={() => onChange(option.key)}
        />
      ))}
    </ScrollView>
  );
}

/** Time slots in 30-minute steps. Past slots are disabled when `date` is today. */
export function TimeChips({
  value,
  onChange,
  date,
  startHour = 8,
  endHour = 21,
  stepMinutes = 30,
}: {
  value: string;
  onChange: (time: string) => void;
  date: string;
  startHour?: number;
  endHour?: number;
  stepMinutes?: number;
}) {
  const isToday = date === moment().format('YYYY-MM-DD');
  const slots = React.useMemo(() => {
    const out: {key: string; label: string; past: boolean}[] = [];
    const now = moment();
    for (let m = startHour * 60; m <= endHour * 60; m += stepMinutes) {
      const slot = moment(date, 'YYYY-MM-DD').startOf('day').add(m, 'minutes');
      out.push({
        key: slot.format('HH:mm'),
        label: slot.format('h:mm A'),
        past: isToday && slot.isBefore(now),
      });
    }
    return out;
  }, [date, endHour, isToday, startHour, stepMinutes]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {slots.map(slot => (
        <Chip
          key={slot.key}
          label={slot.label}
          active={value === slot.key}
          disabled={slot.past}
          onPress={() => onChange(slot.key)}
        />
      ))}
    </ScrollView>
  );
}

/** Next selectable 30-minute slot at least `leadMinutes` from now. */
export function nextSlot(leadMinutes = 60): {date: string; time: string} {
  const t = moment().add(leadMinutes, 'minutes');
  const remainder = t.minute() % 30;
  if (remainder) {
    t.add(30 - remainder, 'minutes');
  }
  t.seconds(0);
  if (t.hour() >= 21 || t.hour() < 8) {
    const next = (t.hour() >= 21 ? t.clone().add(1, 'day') : t.clone())
      .hour(9)
      .minute(0);
    return {date: next.format('YYYY-MM-DD'), time: next.format('HH:mm')};
  }
  return {date: t.format('YYYY-MM-DD'), time: t.format('HH:mm')};
}

const styles = StyleSheet.create({
  row: {gap: spacing.sm, paddingVertical: 2},
  chip: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipDisabled: {opacity: 0.35},
  chipLabel: {fontSize: 13, fontWeight: '600', color: colors.black},
  chipSub: {fontSize: 11, color: colors.gray2, marginTop: 1},
  chipLabelActive: {color: colors.white},
});
