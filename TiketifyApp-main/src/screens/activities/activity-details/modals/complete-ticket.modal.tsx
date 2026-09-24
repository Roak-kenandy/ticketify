import React from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';
import ModalFooterActions from '../../../../components/ui/modal-footer-actions';
import Snackbar from 'react-native-snackbar';
import {useDispatch, useSelector} from 'react-redux';
import {API_BASE_URL} from '../../../../config/api';
import {notifyTicketMutation} from '../../../../services/ticketsSync';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: number;
  nextStage: any;
  onSuccess?: (updatedTicket: any) => void;
};

const ClosingModal = (props: Props) => {
  const dispatch = useDispatch();
  const token = useSelector((state: any) => state.auth?.token);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [note, setNote] = React.useState('');

  async function submitNote() {
    if (isSubmitting) {
      return;
    }
    if (!note.trim()) {
      Snackbar.show({
        text: 'Please enter a note',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/tickets/${props.ticketId}/complete`,
        {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: note,
            pinned: false,
            stage_id: props.nextStage.id,
          }),
        },
      );
      const data = await response.json();

      if (data.status == 403) {
        Snackbar.show({
          text: data.message,
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'red',
          textColor: colors.white,
        });
        props.setModalVisible(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to close ticket');
      }

      const updated = await notifyTicketMutation(
        dispatch,
        token,
        props.ticketId,
        {state: 'CLOSED'},
        {id: props.ticketId, state: 'CLOSED'},
      );

      Snackbar.show({
        text: 'Ticket Closed Successfully',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: colors.primary,
        textColor: colors.white,
      });
      props.setModalVisible(false);
      props.onSuccess?.(updated);
    } catch (error: any) {
      Snackbar.show({
        text: error?.message || 'Failed to close ticket',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.centeredView}>
      <Modal
        animationType="fade"
        transparent={true}
        statusBarTranslucent={true}
        presentationStyle="overFullScreen"
        visible={props.modalVisible}
        onRequestClose={() => {
          Alert.alert('Modal has been closed.');
          props.setModalVisible(!props.modalVisible);
        }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.5)',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{width: '100%', alignItems: 'center'}}>
              <View style={styles.modalView}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    color: colors.black,
                  }}>
                  Add Closing Comment
                </Text>

                <ASeperator />

                <View style={{gap: 10, width: '100%'}}>
                  <Text style={{fontSize: 14, color: colors.black}}>
                    Comment
                  </Text>
                  <TextInput
                    multiline
                    onChangeText={setNote}
                    value={note}
                    numberOfLines={4}
                    style={{
                      backgroundColor: colors.gray,
                      padding: 10,
                      borderRadius: 5,
                      width: '100%',
                      height: 100,
                    }}
                    placeholder="Enter description"
                    placeholderTextColor={colors.gray2}
                  />
                </View>

                <ModalFooterActions
                  onCancel={() => props.setModalVisible(false)}
                  onSubmit={submitNote}
                  loading={isSubmitting}
                />
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export default ClosingModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  modalView: {
    width: '95%',
    gap: 10,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 15,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
