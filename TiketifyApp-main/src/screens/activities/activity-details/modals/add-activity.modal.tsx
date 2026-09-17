import React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import SecondaryButton from '../../../../components/ui/secondary-button';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';
import PrimaryButton from '../../../../components/ui/primary-button';
import {useSelector} from 'react-redux';
import Snackbar from 'react-native-snackbar';

type Props = {
  ticketId: string | number;
  context: any; // Context structure can vary
  contactId?: string;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  onSuccess?: () => void; // Callback to refresh parent data
};

const AddActivityModal = (props: Props) => {
  let auth = useSelector((state: any) => state.auth);
  const [activityName, setActivityName] = React.useState('');
  const [activityDescription, setActivityDescription] = React.useState('');
  const [activityNote, setActivityNote] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function submitActivity() {
    setIsSubmitting(true);

    // Validation
    if (!activityName.trim()) {
      setIsSubmitting(false);
      Snackbar.show({
        text: 'Please enter activity name',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }

    if (!activityDescription.trim()) {
      setIsSubmitting(false);
      Snackbar.show({
        text: 'Please enter activity description',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }

    // Build the activity data with correct format
    const activityData = {
      name: activityName, // Ensure no leading/trailing spaces
      description: activityDescription.trim(),
      type_id: props.context?.activityTypes[0]?.id,
      date: Math.floor(Date.now() / 1000), // Convert to Unix timestamp
      notes: activityNote.trim(),
      custom_fields: [],
      assigned_to: {
        user_id: null,
        team_id: props.context?.teams?.id, // Use string ID from context
      },
      linked_to: [
        {
          type: 'CONTACT',
          id: props.contactId, // Use the actual contact ID (should be UUID string)
        },
        {
          type: 'SERVICE_REQUEST',
          id: props.ticketId, // Use the actual ticket ID (should be UUID string)
        },
      ],
    };

    try {
      console.log('Creating activity with data:', activityData);

      const response = await fetch(
        `https://api.ticketify.medianet.mv/api/v1/activities`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + auth?.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(activityData),
        },
      );

      const data = await response.json();

      console.log('API Response:', {
        status: response.status,
        ok: response.ok,
        data: data,
        activityData: activityData,
        ticketId: props.ticketId,
        contactId: props.contactId,
      });

      // Check if the response indicates an error
      if (!response.ok || data?.error || data?.message) {
        const errorMessage =
          data?.message || data?.error || `HTTP ${response.status}`;

        Snackbar.show({
          text: errorMessage,
          duration: Snackbar.LENGTH_SHORT,
          backgroundColor: 'red',
          textColor: colors.white,
        });
        setIsSubmitting(false);
        return;
      }

      // Success
      Snackbar.show({
        text: 'Activity added successfully',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: colors.primary,
        textColor: colors.white,
      });

      // Reset form
      setActivityName('');
      setActivityDescription('');
      setActivityNote('');

      setIsSubmitting(false);
      props.setModalVisible(false);
      
      // Call success callback to refresh parent data
      if (props.onSuccess) {
        props.onSuccess();
      }
    } catch (error) {
      console.error('Network Error:', error);
      setIsSubmitting(false);
      Snackbar.show({
        text: error?.message || 'Failed to create activity',
        duration: Snackbar.LENGTH_SHORT,
        backgroundColor: 'red',
        textColor: colors.white,
      });
    }
    // Submit activity
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
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{width: '100%', alignItems: 'center'}}>
              <View style={styles.modalView}>
            <Text
              style={{fontSize: 18, fontWeight: '600', color: colors.black}}>
              Add Activity
            </Text>

            <ASeperator />

            <View
              style={{
                gap: 20,
                display: 'flex',
                width: '100%',
              }}>
              <View
                style={{
                  gap: 4,
                }}>
                <Text style={{fontSize: 12, color: colors.black}}>
                  Activity Type
                </Text>
                {/* list Activity Types */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: 5,
                    paddingHorizontal: 10,
                    borderColor: colors.gray2,
                    borderWidth: 1,
                    borderRadius: 100,
                  }}>
                  <Text style={{fontSize: 12, color: colors.black}}>
                    {props.context?.activityTypes[0]?.name ||
                      'Select Activity Type'}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  gap: 4,
                  display: 'flex',
                  width: '100%',
                }}>
                <Text style={{fontSize: 12, color: colors.black}}>
                  Activity Name
                </Text>
                {/* list Activity Types */}
                <TextInput
                  placeholderTextColor={colors.gray2}
                  style={styles.textInput}
                  placeholder="Enter Activity Name"
                  onChange={e => setActivityName(e.nativeEvent.text)}
                />
              </View>

              <View
                style={{
                  gap: 4,
                  display: 'flex',
                  width: '100%',
                }}>
                <Text style={{fontSize: 12, color: colors.black}}>
                  Activity Description
                </Text>
                {/* list Activity Types */}

                <TextInput
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: colors.gray,
                    padding: 10,
                    borderRadius: 5,
                    width: '100%',
                    height: 80,
                  }}
                  placeholder="Enter description"
                  placeholderTextColor={colors.gray2}
                  onChange={e => setActivityDescription(e.nativeEvent.text)}
                />
              </View>
              <View
                style={{
                  gap: 4,
                  display: 'flex',
                  width: '100%',
                }}>
                <Text style={{fontSize: 12, color: colors.black}}>
                  Activity Note
                </Text>
                {/* list Activity Types */}
                <TextInput
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: colors.gray,
                    padding: 10,
                    borderRadius: 5,
                    width: '100%',
                    height: 60,
                  }}
                  placeholder="Enter description"
                  placeholderTextColor={colors.gray2}
                  onChange={e => setActivityNote(e.nativeEvent.text)}
                />
              </View>
            </View>

            <View
              style={{
                alignSelf: 'flex-end',
                gap: 10,
                flexDirection: 'row',
              }}>
              <SecondaryButton
                text="Close"
                onPress={() => props.setModalVisible(false)}
              />
              <View
                style={{
                  alignSelf: 'flex-end',
                  gap: 10,
                  flexDirection: 'row',
                }}>
                <PrimaryButton
                  text={isSubmitting ? 'Submitting...' : 'Submit'}
                  onPress={() => (isSubmitting ? null : submitActivity())}
                />
              </View>
            </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export default AddActivityModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    gap: 10,
  },
  modalView: {
    width: '95%',
    display: 'flex',
    gap: 5,
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
  textInput: {
    padding: 5,
    paddingHorizontal: 10,
    borderColor: colors.gray,
    backgroundColor: colors.gray,
    borderWidth: 1,
    borderRadius: 100,
    width: '100%',
  },
});
