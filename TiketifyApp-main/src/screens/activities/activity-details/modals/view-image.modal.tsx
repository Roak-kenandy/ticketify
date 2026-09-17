import React from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../../../constants/colors';

type Props = {
  image: any;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
};

let {width, height} = Dimensions.get('window');

const ViewImageModal = (props: Props) => {
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
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}></View>
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <View
              style={{
                alignSelf: 'flex-end',
                gap: 10,
                flexDirection: 'row',
              }}>
              <TouchableOpacity
                onPress={() => props.setModalVisible(false)}
                style={{
                  padding: 5,
                  borderRadius: 10,
                }}>
                <Icon name="close" size={20} color={colors.black} />
              </TouchableOpacity>
            </View>

            <Image
              style={{
                width: '100%',
                height: width - 10,
                borderRadius: 20,
                objectFit: 'contain',
              }}
              alt={props.image?.file_url}
              source={{
                uri: `https://app.crm.com/backoffice/v2/files/${props.image?.file?.id}`,
                headers: {
                  api_key: '67225f81-1d60-4401-b6d7-720f9cf68ba3',
                },
              }}
            />
            <Text
              style={{
                fontSize: 14,
                color: colors.black,
                paddingVertical: 10,
                alignContent: 'center',
                width: '100%',
                textAlign: 'center',
              }}>
              {props.image?.description}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ViewImageModal;

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
});
