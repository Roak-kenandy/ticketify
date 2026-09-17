import React from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {KeyboardAvoidingView, Platform} from 'react-native';
import SecondaryButton from '../../../../components/ui/secondary-button';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';
import PrimaryButton from '../../../../components/ui/primary-button';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchImageLibrary} from 'react-native-image-picker';
import {useSelector} from 'react-redux';
import Snackbar from 'react-native-snackbar';

let {width} = Dimensions.get('window');

type Props = {
  navigation: any;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: number;
  onSuccess?: () => void; // Callback to refresh parent data
};

const AddAttachmentModal = (props: Props) => {
  let auth = useSelector((state: any) => state.auth);
  let [keyboardVisible, setKeyboardVisible] = React.useState(false);
  let [isSubmitting, setIsSubmitting] = React.useState(false);
  let [selectedImage, setSelectedImage] = React.useState<{
    uri: string;
    name: string;
    originalName: string;
  }>({
    uri: '',
    name: '',
    originalName: '',
  });
  let [description, setDescription] = React.useState('');

  const ImagePicker = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
      },
      response => {
        console.log('Response = ', response.assets?.[0]?.uri);
        console.log('Image Captured', response?.assets?.[0]?.uri);
        if (response.assets?.[0]?.uri === undefined) {
        } else {
          setSelectedImage({
            uri: response.assets?.[0]?.uri as string,
            name: response.assets?.[0]?.fileName as string,
            originalName: response.assets?.[0]?.fileName as string,
          });
        }

        if (response.didCancel) {
          console.log('User cancelled image picker');
        } else if (response.errorCode) {
          console.log('ImagePicker Error: ', response.errorMessage);
        } else if (response.errorMessage) {
          console.log('User tapped custom button: ');
        }
      },
    );
  };

  async function submitAttachment() {
    setIsSubmitting(true);
    let formData = new FormData();

    if (selectedImage.uri === '') {
      Alert.alert('Error', 'Please select an image');
      return;
    }
    if (description === '') {
      Alert.alert('Error', 'Please enter description');
      return;
    }
    formData.append('description', description);
    formData.append('file', {
      uri: selectedImage.uri,
      name: selectedImage.name,

      type: 'image/jpeg',
    });

    let file = await fetch('https://app.crm.com/backoffice/v2/upload/files', {
      method: 'POST',
      headers: {
        api_key: '67225f81-1d60-4401-b6d7-720f9cf68ba3',
      },
      body: formData,
    })
      .then(response => response.json())

      .then(async data => {
        if (data?.status == 400) {
          console.error('Error:', data);
          setIsSubmitting(false);
          Snackbar.show({
            backgroundColor: colors.primary,
            textColor: colors.white,
            text: data?.message || 'Error uploading file',
            duration: Snackbar.LENGTH_SHORT,
          });
          return;
        }

        console.log('File ID', data.id);
        fetch(
          `https://api.ticketify.medianet.mv/api/v1/tickets/${props.ticketId}/attachments`,
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + auth?.token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              file_id: data.id,
              description: description,
              link: null,
            }),
          },
        )
          .then(response => response.json())
          .then(data => {
            console.log(data);
            Snackbar.show({
              backgroundColor: colors.primary,
              textColor: colors.white,
              text: data.message,
              duration: Snackbar.LENGTH_SHORT,
            });
            
            // Clear form
            setSelectedImage({
              uri: '',
              name: '',
              originalName: '',
            });
            setDescription('');
            
            props.setModalVisible(false);
            setIsSubmitting(false);
            
            // Call success callback to refresh parent data
            if (props.onSuccess) {
              props.onSuccess();
            }
          })
          .catch(error => {
            console.error('Error:', error);
            Snackbar.show({
              backgroundColor: colors.primary,
              textColor: colors.white,
              text: error?.message,
              duration: Snackbar.LENGTH_SHORT,
            });
            setIsSubmitting(false);
          });
      })
      .catch(error => {
        console.error('Error:', error);
        Snackbar.show({
          backgroundColor: colors.primary,
          textColor: colors.white,
          text: error?.message,
          duration: Snackbar.LENGTH_SHORT,
        });
        Alert.alert('Error', error?.message);
        setIsSubmitting(false);
      });
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
                    Add Attachment
                  </Text>
                  <SecondaryButton
                    text="Close"
                    onPress={() => props.setModalVisible(false)}
                  />
                </View>
                <ASeperator />
                <View
                  style={{
                    display: 'flex',
                    width: '100%',
                    gap: 10,
                    paddingBottom: 10,
                  }}>
                  <View>
                    <Text style={{fontSize: 14, color: colors.black}}>
                      Add Media
                    </Text>
                    <Text style={{fontSize: 12, color: colors.gray2}}>
                      Upload from your device or take a photo
                    </Text>
                    {selectedImage.uri === '' ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          width: Dimensions.get('window').width - 100,
                          gap: 10,
                          paddingVertical: 10,
                        }}>
                        <TouchableOpacity
                          onPress={ImagePicker}
                          style={{
                            backgroundColor: colors.gray,
                            padding: 10,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRadius: 5,
                            width: Dimensions.get('window').width - 60,
                          }}>
                          <Icon name="images" size={25} color={colors.black} />
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.black,
                              textAlign: 'center',
                            }}>
                            Import from device
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View
                        style={{
                          justifyContent: 'center',
                          alignItems: 'center',
                          width: '100%',
                          gap: 10,
                          paddingVertical: 10,
                        }}>
                        <Image
                          source={{uri: selectedImage.uri}}
                          style={{width: 200, height: 200}}
                        />
                        <Text style={{fontSize: 12, color: colors.gray2}}>
                          {selectedImage.originalName}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            setSelectedImage({
                              uri: '',
                              name: '',
                              originalName: '',
                            })
                          }
                          style={{
                            padding: 10,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRadius: 5,
                            width: Dimensions.get('window').width / 2.3,
                          }}>
                          <Icon name="trash" size={25} color={colors.black} />
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.black,
                              textAlign: 'center',
                            }}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* when keyboard visible show */}
                  {keyboardVisible ? (
                    <TouchableWithoutFeedback
                      onPress={() => {
                        Keyboard.dismiss();
                        setKeyboardVisible(false);
                      }}>
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                        }}></View>
                    </TouchableWithoutFeedback>
                  ) : null}

                  <View
                    style={{
                      gap: 10,
                    }}>
                    <Text style={{fontSize: 14, color: colors.black}}>
                      Description
                    </Text>
                    <TextInput
                      onPress={() => {
                        setKeyboardVisible(true);
                      }}
                      multiline
                      returnKeyType="none"
                      numberOfLines={4}
                      onChange={e => setDescription(e.nativeEvent.text)}
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
                </View>

                <View
                  style={{
                    alignSelf: 'flex-end',
                    gap: 10,
                    flexDirection: 'row',
                  }}>
                  <PrimaryButton
                    text={
                      isSubmitting
                        ? 'Submitting Attachment...'
                        : 'Submit Attachment'
                    }
                    onPress={() => {
                      isSubmitting ? null : submitAttachment();
                    }}
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

export default AddAttachmentModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  modalView: {
    width: '95%',
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
  modalContainer: {
    padding: 15,
    rowGap: 15,
    borderWidth: 0.4,
    width: width / 1 - 40,
    borderRadius: 20,
    borderColor: colors.bordergray,
    backgroundColor: colors.gray,
  },
});
