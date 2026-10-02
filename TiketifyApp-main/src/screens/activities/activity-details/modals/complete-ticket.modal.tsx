import React from 'react';
import {Text, TextInput, View} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import FormModal, {formStyles} from '../../../../components/modal/form-modal';
import colors from '../../../../constants/colors';
import {apiPut} from '../../../../utils/apiClient';
import {notifyTicketMutation} from '../../../../services/ticketsSync';
import {showError, showSuccess} from '../../../../utils/notify';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: number | string;
  nextStage: any;
  onSuccess?: (updatedTicket: any) => void;
};

const ClosingModal = (props: Props) => {
  const dispatch = useDispatch();
  const token = useSelector((state: any) => state.auth?.token);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');

  async function submit() {
    if (isSubmitting) {
      return;
    }
    if (!note.trim()) {
      setError('Add a closing comment for the customer record.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await apiPut(
        `/tickets/${props.ticketId}/complete`,
        {comment: note.trim(), pinned: false, stage_id: props.nextStage?.id},
        token,
        {timeoutMs: 45000},
      );

      const updated = await notifyTicketMutation(
        dispatch,
        token,
        String(props.ticketId),
        {state: 'CLOSED'},
        {id: props.ticketId, state: 'CLOSED'},
      );

      showSuccess('Ticket closed');
      setNote('');
      props.setModalVisible(false);
      props.onSuccess?.(updated);
    } catch (err: any) {
      showError(err?.message || 'Could not close the ticket');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={() => {
        setError('');
        props.setModalVisible(false);
      }}
      title="Close ticket"
      subtitle="This completes the job in the CRM. Make sure all work is done."
      loading={isSubmitting}
      footer={{onSubmit: submit, submitText: 'Close ticket'}}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Closing comment</Text>
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
          placeholder="Summarise the fix and anything the customer should know"
          placeholderTextColor={colors.gray3}
          editable={!isSubmitting}
        />
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </View>
    </FormModal>
  );
};

export default ClosingModal;
