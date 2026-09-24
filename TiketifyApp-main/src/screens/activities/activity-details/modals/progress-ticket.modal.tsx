import React from 'react';
import {
  Alert,
  Keyboard,
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
import Snackbar from 'react-native-snackbar';
import {useDispatch, useSelector} from 'react-redux';
import ModalFooterActions from '../../../../components/ui/modal-footer-actions';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';
import {API_BASE_URL} from '../../../../config/api';
import {notifyTicketMutation} from '../../../../services/ticketsSync';

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
  const [shouldNotifyCustomer, setShouldNotifyCustomer] = React.useState(true);

  async function submitProgress() {
    props.setSubmitted(true);

    try {
      const endpoint = props.isFirstStart
        ? `${API_BASE_URL}/tickets/${props.ticket.id}/start`
        : `${API_BASE_URL}/tickets/${
            props.ticket.id
          }/progress?smsNotification=${shouldNotifyCustomer ? 'true' : 'false'}`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: props.isFirstStart
          ? JSON.stringify({stage_id: props.nextStage?.id})
          : JSON.stringify({
              comment: note || 'No comment',
              stage_id: props.nextStage?.id,
              stage_name: props.nextStage?.name,
            }),
      });

      const data = await response.json();
      if (!response.ok || (props.isFirstStart && data?.state !== 'IN_PROGRESS')) {
        throw new Error(data?.message || 'Failed to update ticket');
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

      Snackbar.show({
        backgroundColor: 'green',
        textColor: colors.white,
        text: props.isFirstStart
          ? 'Troubleshooting started'
          : 'Ticket progressed',
        duration: Snackbar.LENGTH_SHORT,
      });

      props.setModalVisible(false);
      props.onSuccess?.(updated);
    } catch (error: any) {
      Snackbar.show({
        backgroundColor: colors.primary,
        textColor: colors.white,
        text: error?.message || 'Failed to update ticket',
        duration: Snackbar.LENGTH_SHORT,
      });
    } finally {
      setIsSubmitting(false);
      props.setSubmitted(false);
    }
  }

  async function submitNote() {
    if (isSubmitting) {
      return;
    }
    if (!props.isFirstStart && !note.trim()) {
      Snackbar.show({
        text: 'Please enter a note',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }

    setIsSubmitting(true);
    await submitProgress();
  }

  return (
    <Modal
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
      visible={props.modalVisible}
      onRequestClose={() => {
        Alert.alert('Modal has been closed.');
        props.setModalVisible(false);
      }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.centeredView}>
            <View style={styles.modalView}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '600',
                  color: colors.black,
                }}>
                {props.isFirstStart ? 'Start Troubleshooting' : 'Review'}
              </Text>
              <ASeperator />

              {!props.isFirstStart && (
                <>
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

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      justifyContent: 'space-between',
                      width: '100%',
                    }}>
                    <Text style={{fontSize: 14, color: colors.black}}>
                      Notify customer
                    </Text>
                    <Switch
                      trackColor={{false: colors.gray, true: colors.primary}}
                      thumbColor={
                        shouldNotifyCustomer ? colors.white : colors.gray2
                      }
                      ios_backgroundColor={colors.gray}
                      onValueChange={() =>
                        setShouldNotifyCustomer(!shouldNotifyCustomer)
                      }
                      value={shouldNotifyCustomer}
                    />
                  </View>
                </>
              )}

              {props.isFirstStart && (
                <Text style={{fontSize: 14, color: colors.black}}>
                  This will mark the ticket as In Progress and notify the
                  customer.
                </Text>
              )}

              <ModalFooterActions
                onCancel={() => props.setModalVisible(false)}
                onSubmit={submitNote}
                submitText={props.isFirstStart ? 'Start' : 'Submit'}
                loading={isSubmitting}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default ProgressTicketModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
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
