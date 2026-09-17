import React from 'react';
import {
  Alert,
  Dimensions,
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
import SecondaryButton from '../../../../components/ui/secondary-button';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';
import PrimaryButton from '../../../../components/ui/primary-button';
import Snackbar from 'react-native-snackbar';
import {useSelector} from 'react-redux';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: number;
  onSuccess?: () => void; // Callback to refresh parent data
};

const AddNoteModal = (props: Props) => {
  let [isSubmitting, setIsSubmitting] = React.useState(false);
  let auth = useSelector((state: any) => state.auth);
  let [note, setNote] = React.useState('');

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

    await fetch(
      `https://api.ticketify.medianet.mv/api/v1/tickets/${props.ticketId}/notes`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + auth?.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          note: note,
          pinned: false,
        }),
      },
    )
      .then(response => response.json())
      .then(data => {
        console.log(data);
        Snackbar.show({
          text: 'Note submitted successfully',
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: colors.primary,
          textColor: colors.white,
        });
        setNote(''); // Clear the form
        setIsSubmitting(false);
        props.setModalVisible(false);
        
        // Call success callback to refresh parent data
        if (props.onSuccess) {
          props.onSuccess();
        }
      })
      .catch(error => {
        console.error('Error:', error);
        setIsSubmitting(false);
        Snackbar.show({
          text: error?.message,
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'red',
          textColor: colors.white,
        });
      });

    // Submit note
  }
  return (
    <View style={styles.centeredView}>
      <Modal
        style={{backgroundColor: 'rgba(0, 0, 0, 0.5)'}}
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
                    Add Note
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
                    display: 'flex',
                    width: '100%',
                  }}>
                  <Text style={{fontSize: 14, color: colors.black}}>
                    Description
                  </Text>
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
    </View>
  );
};

export default AddNoteModal;

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
