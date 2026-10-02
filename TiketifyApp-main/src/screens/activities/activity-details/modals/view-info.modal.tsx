import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import moment from 'moment';
import FormModal from '../../../../components/modal/form-modal';
import {EmptyState} from '../../../../components/ui/state-views';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticket: any;
};

/** Stage timeline for the ticket's CRM queue. */
const ViewInfoModal = (props: Props) => {
  const stages: any[] = React.useMemo(
    () =>
      [...(props.ticket?.queue_info?.stages ?? [])].sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
      ),
    [props.ticket?.queue_info?.stages],
  );
  const history: any[] = props.ticket?.queue?.content ?? [];
  const currentId = props.ticket?.stage?.id;
  const currentIndex = stages.findIndex(stage => stage.id === currentId);

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={() => props.setModalVisible(false)}
      title="Ticket progress"
      subtitle={props.ticket?.queue_info?.name}>
      {stages.length === 0 ? (
        <EmptyState
          compact
          icon="git-commit-outline"
          title="No stages"
          message="This ticket's queue has no workflow stages."
        />
      ) : (
        <View>
          {stages.map((stage, index) => {
            const done = currentIndex >= 0 && index < currentIndex;
            const current = index === currentIndex;
            const entries = history.filter(
              entry => entry?.stage?.id === stage.id,
            );
            const tint = current
              ? colors.primary
              : done
              ? colors.success
              : colors.bordergray;
            return (
              <View key={stage.id ?? index} style={styles.step}>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.dot,
                      {borderColor: tint},
                      (done || current) && {backgroundColor: tint},
                    ]}>
                    {done ? (
                      <Icon name="checkmark" size={12} color={colors.white} />
                    ) : null}
                  </View>
                  {index < stages.length - 1 ? (
                    <View
                      style={[
                        styles.line,
                        done && {backgroundColor: colors.success},
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.content}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[
                        styles.stageName,
                        current && styles.stageCurrent,
                      ]}>
                      {stage.name}
                    </Text>
                    {current ? (
                      <Text style={styles.currentTag}>Current</Text>
                    ) : null}
                  </View>
                  {entries.map((entry, entryIndex) => (
                    <View
                      key={`${stage.id}-${entryIndex}`}
                      style={styles.entry}>
                      {entry?.comment ? (
                        <Text style={styles.comment}>{entry.comment}</Text>
                      ) : null}
                      <Text style={styles.meta}>
                        {entry?.date_achieved
                          ? moment(entry.date_achieved * 1000).format(
                              'DD MMM YYYY, h:mm A',
                            )
                          : ''}
                        {' · '}
                        {entry?.performed_by?.username || 'System'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </FormModal>
  );
};

export default ViewInfoModal;

const styles = StyleSheet.create({
  step: {flexDirection: 'row', gap: spacing.md},
  rail: {alignItems: 'center', width: 20},
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 16,
    backgroundColor: colors.bordergray,
    marginVertical: 2,
  },
  content: {flex: 1, paddingBottom: spacing.lg, gap: spacing.xs},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  stageName: {fontSize: 14, fontWeight: '600', color: colors.black},
  stageCurrent: {color: colors.primary},
  currentTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.tertiary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  entry: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    gap: 2,
  },
  comment: {fontSize: 13, color: colors.black},
  meta: {fontSize: 11, color: colors.gray2},
});
