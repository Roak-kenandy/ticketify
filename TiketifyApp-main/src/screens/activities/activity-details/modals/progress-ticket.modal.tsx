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
import {useSelector} from 'react-redux';
import PrimaryButton from '../../../../components/ui/primary-button';
import SecondaryButton from '../../../../components/ui/secondary-button';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  setSubmitted: (value: boolean) => void;
  ticket: any;
  navigation: any;
  nextStage: any;
};

const ProgressTicketModal = (props: Props) => {
  let [isSubmitting, setIsSubmitting] = React.useState(false);
  let [keyboardVisible, setKeyboardVisible] = React.useState(false);
  let state = useSelector((state: any) => state.auth);
  let [note, setNote] = React.useState('');
  const [shouldNotifyCustomer, setShouldNotifyCustomer] = React.useState(true);

  function progressTicket() {
    props.setSubmitted(true);

    console.log('progressing ticket....');
    console.log('Customer will be notified: ', shouldNotifyCustomer);
    fetch(
      `https://api.ticketify.medianet.mv/api/v1/tickets/${
        props.ticket.id
      }/progress?smsNotification=${shouldNotifyCustomer ? 'true' : 'false'}`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + state?.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: note || 'No comment',
          stage_id: props.nextStage?.id,
          stage_name: props.nextStage?.name,
        }),
      },
    )
      .then(response => response.json())
      .then(data => {
        console.log(data);
        console.log('ticket progressed and customer has been notified.');

        Snackbar.show({
          backgroundColor: 'green',
          textColor: colors.white,
          text: 'Ticket progressed',
          duration: Snackbar.LENGTH_SHORT,
        });
        props.navigation.navigate('HomeScreen');
      })
      .catch(error => {
        Snackbar.show({
          backgroundColor: colors.primary,
          textColor: colors.white,
          text: error?.message,
          duration: Snackbar.LENGTH_SHORT,
        });
      });
  }

  async function submitNote() {
    setIsSubmitting(true);
    if (!note) {
      setIsSubmitting(false);
      Snackbar.show({
        text: 'Please enter a note',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
    }

    progressTicket();

    // Submit note
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
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  width: '100%',
                  alignItems: 'center',
                }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    color: colors.black,
                  }}>
                  Review
                </Text>
                <SecondaryButton
                  text="Close"
                  onPress={() => props.setModalVisible(false)}
                />
              </View>
              <ASeperator />

              <View
                style={{
                  gap: 10,
                  width: '100%',
                }}>
                <Text style={{fontSize: 14, color: colors.black}}>Comment</Text>
                <TextInput
                  multiline
                  onChange={e => setNote(e.nativeEvent.text)}
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

              {/* Notifiy customer */}
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

              <ASeperator />
              <View
                style={{
                  alignSelf: 'flex-end',
                  gap: 10,
                  flexDirection: 'row',
                }}>
                <PrimaryButton
                  text={isSubmitting ? 'Submitting...' : 'Submit'}
                  onPress={() => (isSubmitting ? null : submitNote())}
                />
              </View>
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
  },
});
