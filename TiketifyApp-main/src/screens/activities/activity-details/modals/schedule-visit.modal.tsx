import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import moment from 'moment';
import colors from '../../../../constants/colors';
import ModalFooterActions from '../../../../components/ui/modal-footer-actions';
import Snackbar from 'react-native-snackbar';
import {useSelector} from 'react-redux';
import {apiFetch} from '../../../../utils/apiClient';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: string | number;
  onSuccess?: () => void;
};

const ScheduleVisitModal = (props: Props) => {
  const auth = useSelector((state: any) => state.auth);
  const defaultWhen = moment().add(1, 'hour');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [dateStr, setDateStr] = React.useState(defaultWhen.format('YYYY-MM-DD'));
  const [timeStr, setTimeStr] = React.useState(defaultWhen.format('HH:mm'));
  const [notifyCustomer, setNotifyCustomer] = React.useState(true);

  async function submitSchedule() {
    if (!props.ticketId || !auth?.token) {
      return;
    }
    const scheduledAt = moment(
      `${dateStr.trim()} ${timeStr.trim()}`,
      'YYYY-MM-DD HH:mm',
      true,
    );
    if (!scheduledAt.isValid() || scheduledAt.isBefore(moment())) {
      Snackbar.show({
        text: 'Enter a valid future date (YYYY-MM-DD) and time (HH:mm)',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const {data, response} = await apiFetch(
        `/tickets/${props.ticketId}/schedule`,
        auth.token,
        {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            scheduled_at: scheduledAt.toISOString(),
            notify_customer: notifyCustomer,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          Array.isArray(data?.message)
            ? data.message.join(', ')
            : data?.message || 'Could not schedule visit',
        );
      }
      Snackbar.show({
        text: data?.sms_sent
          ? 'Visit scheduled and customer notified'
          : 'Visit scheduled',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: colors.primary,
        textColor: colors.white,
      });
      props.setModalVisible(false);
      props.onSuccess?.();
    } catch (error: any) {
      Snackbar.show({
        text: error?.message || 'Schedule failed',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={props.modalVisible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={() => props.setModalVisible(false)}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheet}>
              <Text style={styles.title}>Schedule visit</Text>
              <Text style={styles.hint}>
                Adds a CRM note and optionally sends the customer an SMS.
              </Text>

              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={dateStr}
                onChangeText={setDateStr}
                autoCapitalize="none"
                placeholder="2026-09-26"
              />
              <Text style={styles.label}>Time (24h HH:mm)</Text>
              <TextInput
                style={styles.input}
                value={timeStr}
                onChangeText={setTimeStr}
                autoCapitalize="none"
                placeholder="14:30"
              />

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Notify customer (SMS)</Text>
                <Switch
                  value={notifyCustomer}
                  onValueChange={setNotifyCustomer}
                  trackColor={{false: '#94A3B8', true: '#22C55E'}}
                />
              </View>

              <ModalFooterActions
                onSubmit={submitSchedule}
                onCancel={() => props.setModalVisible(false)}
                submitText={isSubmitting ? 'Saving…' : 'Schedule'}
                submitDisabled={isSubmitting}
                loading={isSubmitting}
              />
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default ScheduleVisitModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  hint: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
});
