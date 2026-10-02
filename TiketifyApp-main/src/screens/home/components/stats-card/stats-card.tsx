import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Skeleton} from '../../../../components/ui/state-views';
import colors from '../../../../constants/colors';
import {radius, shadows, spacing} from '../../../../constants/styles';
import {ticketStateMeta} from '../../../../constants/ticket-meta';

type Props = {
  tickets: any[] | null | undefined;
  navigation: any;
  loading?: boolean;
};

const StatsCard = ({tickets, navigation, loading}: Props) => {
  const {counts, currentTask, nextTask} = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const byState = (state: string) =>
      list.filter((t: any) => t.state === state);
    const assigned = byState('NEW');
    const inProgress = byState('IN_PROGRESS');
    return {
      counts: {
        NEW: assigned.length,
        IN_PROGRESS: inProgress.length,
        CLOSED: byState('CLOSED').length,
      },
      currentTask: inProgress[0],
      nextTask: assigned[0],
    };
  }, [tickets]);

  const openTicket = (ticket: any) =>
    ticket && navigation.navigate('ActivityDetailsScreen', {ticket});
  const openList = () => navigation.navigate('My Tickets');

  return (
    <View style={styles.card}>
      <View style={styles.statsRow}>
        {(['NEW', 'IN_PROGRESS', 'CLOSED'] as const).map(state => {
          const tone = ticketStateMeta(state);
          return (
            <TouchableOpacity
              key={state}
              style={[styles.statBox, {backgroundColor: tone.bg}]}
              onPress={openList}
              activeOpacity={0.8}
              accessibilityLabel={`${tone.label}: ${counts[state]}`}>
              {loading ? (
                <Skeleton width={28} height={26} />
              ) : (
                <Text style={[styles.statValue, {color: tone.color}]}>
                  {counts[state]}
                </Text>
              )}
              <Text style={styles.statLabel}>{tone.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.taskSection}>
        <TaskRow
          icon="play-circle-outline"
          label="Current job"
          task={currentTask}
          loading={loading}
          onPress={() => openTicket(currentTask)}
        />
        <View style={styles.divider} />
        <TaskRow
          icon="arrow-forward-circle-outline"
          label="Next up"
          task={nextTask}
          loading={loading}
          onPress={() => openTicket(nextTask)}
        />
      </View>
    </View>
  );
};

function TaskRow({
  icon,
  label,
  task,
  loading,
  onPress,
}: {
  icon: string;
  label: string;
  task: any;
  loading?: boolean;
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
      {loading ? (
        <Skeleton width={90} height={14} />
      ) : (
        <View style={styles.taskRight}>
          <Text
            style={[styles.taskValue, task && styles.taskValueActive]}
            numberOfLines={1}>
            {task?.number ? `#${task.number}` : 'Nothing yet'}
          </Text>
          {task ? (
            <Icon name="chevron-forward" size={16} color={colors.gray3} />
          ) : null}
        </View>
      )}
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
  statsRow: {flexDirection: 'row', gap: spacing.sm},
  statBox: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {fontSize: 26, fontWeight: '700'},
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  taskSection: {gap: spacing.sm},
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 32,
  },
  taskLeft: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  taskLabel: {fontSize: 14, fontWeight: '600', color: colors.black},
  taskRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  taskValue: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.gray3,
    textAlign: 'right',
  },
  taskValueActive: {color: colors.primary, fontWeight: '600'},
  divider: {height: 1, backgroundColor: colors.borderLight},
});
