import React from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';
import moment from 'moment';
import {useSelector} from 'react-redux';
import FormModal, {formStyles} from '../../../../components/modal/form-modal';
import {
  DateChips,
  TimeChips,
  nextSlot,
} from '../../../../components/ui/date-time-chips';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';
import {apiPut} from '../../../../utils/apiClient';
import {showError, showSuccess} from '../../../../utils/notify';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: string | number;
  onSuccess?: () => void;
};

const ScheduleVisitModal = (props: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [dateStr, setDateStr] = React.useState(() => nextSlot().date);
  const [timeStr, setTimeStr] = React.useState(() => nextSlot().time);
  const [notifyCustomer, setNotifyCustomer] = React.useState(true);

  React.useEffect(() => {
    if (props.modalVisible) {
      const slot = nextSlot();
      setDateStr(slot.date);
      setTimeStr(slot.time);
    }
  }, [props.modalVisible]);

  const scheduledAt = moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm', true);
  const isValid = scheduledAt.isValid() && scheduledAt.isAfter(moment());

  async function submitSchedule() {
    if (!props.ticketId || !token) {
      return;
    }
    if (!isValid) {
      showError('Pick a time later than now');
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await apiPut(
        `/tickets/${props.ticketId}/schedule`,
        {
          scheduled_at: scheduledAt.toISOString(),
          notify_customer: notifyCustomer,
        },
        token,
      );
      showSuccess(
        data?.sms_sent
          ? 'Visit scheduled, customer notified'
          : 'Visit scheduled',
      );
      props.setModalVisible(false);
      props.onSuccess?.();
    } catch (err: any) {
      showError(err?.message || 'Could not schedule the visit');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={() => props.setModalVisible(false)}
      title="Schedule visit"
      subtitle="Adds a note to the ticket and can text the customer."
      loading={isSubmitting}
      footer={{
        onSubmit: submitSchedule,
        submitText: 'Schedule',
        submitDisabled: !isValid,
      }}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Day</Text>
        <DateChips value={dateStr} onChange={setDateStr} />
      </View>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Time</Text>
        <TimeChips value={timeStr} onChange={setTimeStr} date={dateStr} />
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {isValid
            ? scheduledAt.format('dddd, D MMMM [at] h:mm A')
            : 'Choose a time later than now'}
        </Text>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.flex}>
          <Text style={formStyles.label}>Notify customer</Text>
          <Text style={formStyles.hint}>Send the visit time by SMS</Text>
        </View>
        <Switch
          value={notifyCustomer}
          onValueChange={setNotifyCustomer}
          trackColor={{false: colors.bordergray, true: colors.primary}}
          thumbColor={colors.white}
          disabled={isSubmitting}
        />
      </View>
    </FormModal>
  );
};

export default ScheduleVisitModal;

const styles = StyleSheet.create({
  flex: {flex: 1},
  summary: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoBg,
  },
  summaryText: {color: colors.info, fontWeight: '600', fontSize: 14},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
