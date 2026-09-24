import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../../../constants/colors';
import {radius, shadows, spacing} from '../../../../constants/styles';

type Props = {
  tickets: any;
  navigation: any;
};

const StatsCard = (props: Props) => {
  const {assigned, inProgress, closed, currentTask, nextTask} = useMemo(() => {
    const ticketList = props.tickets ?? [];
    const assignedTickets = ticketList.filter((t: any) => t.state === 'NEW');
    const inProgressTickets = ticketList.filter(
      (t: any) => t.state === 'IN_PROGRESS',
    );
    const closedTickets = ticketList.filter((t: any) => t.state === 'CLOSED');

    return {
      assigned: assignedTickets,
      inProgress: inProgressTickets,
      closed: closedTickets,
      currentTask: inProgressTickets[0],
      nextTask: assignedTickets[0],
    };
  }, [props.tickets]);

  const stats = [
    {
      label: 'Assigned',
      value: assigned.length,
      color: colors.primary,
      bg: colors.tertiary,
    },
    {
      label: 'In Progress',
      value: inProgress.length,
      color: colors.success,
      bg: colors.successBg,
    },
    {
      label: 'Completed',
      value: closed.length,
      color: colors.warning,
      bg: colors.warningBg,
    },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.statsRow}>
        {stats.map(stat => (
          <View key={stat.label} style={[styles.statBox, {backgroundColor: stat.bg}]}>
            <Text style={[styles.statValue, {color: stat.color}]}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.taskSection}>
        <TaskRow
          icon="play-circle-outline"
          label="Current task"
          task={currentTask}
          onPress={() =>
            currentTask &&
            props.navigation.navigate('ActivityDetailsScreen', {
              ticket: currentTask,
            })
          }
        />
        <View style={styles.divider} />
        <TaskRow
          icon="arrow-forward-circle-outline"
          label="Next up"
          task={nextTask}
          onPress={() =>
            nextTask &&
            props.navigation.navigate('ActivityDetailsScreen', {
              ticket: nextTask,
            })
          }
        />
      </View>
    </View>
  );
};

function TaskRow({
  icon,
  label,
  task,
  onPress,
}: {
  icon: string;
  label: string;
  task: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.taskRow}
      onPress={onPress}
      disabled={!task}
      activeOpacity={0.7}>
      <View style={styles.taskLeft}>
        <Icon name={icon} size={20} color={colors.primary} />
        <Text style={styles.taskLabel}>{label}</Text>
      </View>
      <Text style={styles.taskValue} numberOfLines={1}>
        {task?.number ?? task?.description ?? 'None'}
      </Text>
    </TouchableOpacity>
  );
}

export default React.memo(StatsCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadows.card,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  taskSection: {
    gap: spacing.sm,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  taskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.black,
  },
  taskValue: {
    flex: 1,
    fontSize: 13,
    color: colors.gray2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
});
