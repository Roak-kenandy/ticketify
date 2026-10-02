import React from 'react';
import {Text, TextInput, View} from 'react-native';
import {useSelector} from 'react-redux';
import FormModal, {formStyles} from '../../../../components/modal/form-modal';
import colors from '../../../../constants/colors';
import {apiPost} from '../../../../utils/apiClient';
import {showError, showSuccess} from '../../../../utils/notify';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: number | string;
  onSuccess?: () => void;
};

const AddNoteModal = (props: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');

  const close = () => {
    setError('');
    props.setModalVisible(false);
  };

  async function submitNote() {
    const text = note.trim();
    if (!text) {
      setError('Write a note before saving.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await apiPost(
        `/tickets/${props.ticketId}/notes`,
        {note: text, pinned: false},
        token,
      );
      showSuccess('Note added');
      setNote('');
      props.setModalVisible(false);
      props.onSuccess?.();
    } catch (err: any) {
      showError(err?.message || 'Could not add the note');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={close}
      title="Add note"
      subtitle="Notes are saved to the ticket in the CRM."
      loading={isSubmitting}
      footer={{onSubmit: submitNote, submitText: 'Save note'}}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>Note</Text>
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
          placeholder="What did you find or do on site?"
          placeholderTextColor={colors.gray3}
          editable={!isSubmitting}
        />
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </View>
    </FormModal>
  );
};

export default AddNoteModal;
