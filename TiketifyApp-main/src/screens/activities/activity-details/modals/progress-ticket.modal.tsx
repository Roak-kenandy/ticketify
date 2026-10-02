import React from 'react';
import {StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import FormModal, {formStyles} from '../../../../components/modal/form-modal';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';
import {apiPut} from '../../../../utils/apiClient';
import {notifyTicketMutation} from '../../../../services/ticketsSync';
import {showError, showSuccess} from '../../../../utils/notify';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  setSubmitted: (value: boolean) => void;
  ticket: any;
  nextStage: any;
  isFirstStart?: boolean;
  onSuccess?: (updatedTicket: any) => void;
};

const ProgressTicketModal = (props: Props) => {
  const dispatch = useDispatch();
  const token = useSelector((state: any) => state.auth?.token);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');
  const [shouldNotifyCustomer, setShouldNotifyCustomer] = React.useState(true);

  async function submit() {
    if (isSubmitting) {
      return;
    }
    if (!props.isFirstStart && !note.trim()) {
      setError('Add a short comment about this step.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    props.setSubmitted(true);

    try {
      const data = props.isFirstStart
        ? await apiPut(
            `/tickets/${props.ticket.id}/start`,
            {stage_id: props.nextStage?.id},
            token,
            {timeoutMs: 45000},
          )
        : await apiPut(
            `/tickets/${props.ticket.id}/progress?smsNotification=${
              shouldNotifyCustomer ? 'true' : 'false'
            }`,
            {
              comment: note.trim(),
              stage_id: props.nextStage?.id,
              stage_name: props.nextStage?.name,
            },
            token,
            {timeoutMs: 45000},
          );

      if (props.isFirstStart && data?.state && data.state !== 'IN_PROGRESS') {
        throw new Error(data?.message || 'The CRM did not start the ticket');
      }

      const updated = await notifyTicketMutation(
        dispatch,
        token,
        props.ticket.id,
        {
          state: data?.state ?? 'IN_PROGRESS',
          stage: data?.stage ?? props.nextStage ?? props.ticket.stage,
        },
        {...props.ticket, ...data, id: props.ticket.id},
      );

      showSuccess(props.isFirstStart ? 'Job started' : 'Moved to next step');
      setNote('');
      props.setModalVisible(false);
      props.onSuccess?.(updated);
    } catch (err: any) {
      showError(err?.message || 'Could not update the ticket');
    } finally {
      setIsSubmitting(false);
      props.setSubmitted(false);
    }
  }

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={() => {
        setError('');
        props.setModalVisible(false);
      }}
      title={props.isFirstStart ? 'Start job' : 'Move to next step'}
      subtitle={
        props.isFirstStart
          ? 'Marks the ticket In Progress and lets the customer know you are on it.'
          : props.nextStage?.name
          ? `Next step: ${props.nextStage.name}`
          : undefined
      }
      loading={isSubmitting}
      footer={{
        onSubmit: submit,
        submitText: props.isFirstStart ? 'Start job' : 'Confirm',
      }}>
      {!props.isFirstStart ? (
        <>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Comment</Text>
            <TextInput
              multiline
              value={note}
              onChangeText={value => {
                setNote(value);
                if (error) {
                  setError('');
                }
              }}
              style={formStyles.textArea}
              placeholder="What was done in this step?"
              placeholderTextColor={colors.gray3}
              editable={!isSubmitting}
            />
            {error ? <Text style={formStyles.error}>{error}</Text> : null}
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={formStyles.label}>Notify customer</Text>
              <Text style={formStyles.hint}>Send an SMS update</Text>
            </View>
            <Switch
              trackColor={{false: colors.bordergray, true: colors.primary}}
              thumbColor={colors.white}
              ios_backgroundColor={colors.bordergray}
              onValueChange={setShouldNotifyCustomer}
              value={shouldNotifyCustomer}
              disabled={isSubmitting}
            />
          </View>
        </>
      ) : null}
    </FormModal>
  );
};

export default ProgressTicketModal;

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  toggleText: {flex: 1, gap: 2},
});
