import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSelector} from 'react-redux';
import moment from 'moment';
import FormModal from '../../../../components/modal/form-modal';
import {ToneBadge} from '../../../../components/ui/badge';
import {ErrorState, Skeleton} from '../../../../components/ui/state-views';
import colors from '../../../../constants/colors';
import {radius, spacing, typography} from '../../../../constants/styles';
import {apiGet} from '../../../../utils/apiClient';
import {
  lmStatusLabel,
  resolveCrmActivityState,
} from '../../../../utils/crmActivityState';

type Props = {
  activity: any;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
};

const ActivityDetailModal = (props: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const [details, setDetails] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const activityId = props.activity?.id;

  const load = React.useCallback(async () => {
    if (!activityId) {
      return;
    }
    setDetails(null);
    setError('');
    try {
      setDetails(await apiGet(`/activities/${activityId}`, token));
    } catch (err: any) {
      setError(err?.message || 'Could not load the activity');
    }
  }, [activityId, token]);

  React.useEffect(() => {
    if (props.modalVisible) {
      load();
    }
  }, [props.modalVisible, load]);

  const state = details ? resolveCrmActivityState(details) : null;
  const latestState = details?.states?.length
    ? [...details.states].sort(
        (a: {date: number}, b: {date: number}) => b.date - a.date,
      )[0]
    : null;

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={() => props.setModalVisible(false)}
      title={props.activity?.name || 'Activity'}
      subtitle={props.activity?.type?.name}>
      {error ? (
        <ErrorState message={error} onRetry={load} compact />
      ) : !details ? (
        <View style={styles.skeleton}>
          <Skeleton width="40%" />
          <Skeleton height={44} />
          <Skeleton width="60%" />
          <Skeleton height={64} />
        </View>
      ) : (
        <>
          {state ? (
            <View style={styles.statusRow}>
              <ToneBadge
                tone={
                  state === 'COMPLETED'
                    ? {
                        label: lmStatusLabel(state),
                        color: colors.success,
                        bg: colors.successBg,
                        icon: 'checkmark-circle-outline',
                      }
                    : {
                        label: lmStatusLabel(state),
                        color: colors.info,
                        bg: colors.infoBg,
                        icon: 'time-outline',
                      }
                }
                showIcon
              />
              {latestState ? (
                <Text style={styles.muted}>
                  since{' '}
                  {moment(latestState.date * 1000).format('DD MMM, hh:mm A')}
                </Text>
              ) : null}
            </View>
          ) : null}

          {details.description ? (
            <Section title="Description">
              <Text style={styles.body}>{details.description}</Text>
            </Section>
          ) : null}

          <Section title="Schedule">
            <Text style={styles.body}>
              {details.date
                ? moment(details.date * 1000).format('dddd, DD MMMM YYYY')
                : 'Not scheduled'}
            </Text>
            {details.created_date ? (
              <Text style={styles.muted}>
                Created{' '}
                {moment(details.created_date * 1000).format(
                  'DD MMM YYYY, hh:mm A',
                )}
              </Text>
            ) : null}
          </Section>

          <Section title="Assigned to">
            <Text style={styles.body}>
              {details.assigned_to?.user?.name ||
                details.assigned_to?.team?.name ||
                'Unassigned'}
            </Text>
            {details.assigned_to?.user && details.assigned_to?.team?.name ? (
              <Text style={styles.muted}>{details.assigned_to.team.name}</Text>
            ) : null}
          </Section>

          {details.contact ? (
            <Section title="Customer">
              <View style={styles.card}>
                <Text style={styles.strong}>{details.contact.name}</Text>
                {details.contact.code ? (
                  <Text style={styles.muted}>Code {details.contact.code}</Text>
                ) : null}
                {details.contact.phone?.number ? (
                  <Text style={styles.body}>
                    {details.contact.phone.number}
                  </Text>
                ) : null}
                {details.contact.primary_address ? (
                  <Text style={styles.body}>
                    {[
                      details.contact.primary_address.address_line_1,
                      details.contact.primary_address.town_city,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                ) : null}
              </View>
            </Section>
          ) : null}

          {Array.isArray(details.custom_fields) &&
          details.custom_fields.length > 0 ? (
            <Section title="Details">
              {details.custom_fields.map(
                (field: {label?: string; value?: unknown}, index: number) => (
                  <View key={`${field.label}-${index}`} style={styles.fieldRow}>
                    <Text style={styles.muted}>{field.label}</Text>
                    <Text style={styles.fieldValue}>
                      {String(field.value ?? '—')}
                    </Text>
                  </View>
                ),
              )}
            </Section>
          ) : null}
        </>
      )}
    </FormModal>
  );
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default ActivityDetailModal;

const styles = StyleSheet.create({
  skeleton: {gap: spacing.md},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  section: {gap: 4},
  sectionTitle: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {fontSize: 14, color: colors.black, lineHeight: 20},
  strong: {fontSize: 15, fontWeight: '600', color: colors.black},
  muted: {fontSize: 12, color: colors.gray2},
  card: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 4,
  },
  fieldValue: {
    fontSize: 13,
    color: colors.black,
    flexShrink: 1,
    textAlign: 'right',
  },
});
