import React from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import SecondaryButton from '../../../../components/ui/secondary-button';
import ASeperator from '../../../../components/ui/seperator';
import colors from '../../../../constants/colors';
import PrimaryButton from '../../../../components/ui/primary-button';
import ABadge from '../../../../components/ui/badge';
import moment from 'moment';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticket: any;
};

const ViewInfoModal = (props: Props) => {
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
            <Text
              style={{fontSize: 18, fontWeight: '600', color: colors.black}}>
              Ticket Progress
            </Text>
            <ASeperator />
            <ScrollView
              contentContainerStyle={{
                width: '100%',
                display: 'flex',
                maxHeight: Dimensions.get('window').height - 200,
                overflow: 'scroll',
              }}>
              <FlatList
                data={
                  // sort by order
                  props.ticket?.queue_info?.stages.sort(
                    (a: any, b: any) => a.order - b.order,
                  ) || []
                }
                keyExtractor={(item, index) => index.toString()}
                renderItem={({item, index}) => (
                  <View
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      alignItems: 'flex-start',
                      gap: 5,
                      padding: 5,
                      width: Dimensions.get('window').width - 50,
                    }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 5,
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                      }}>
                      <ABadge
                        title={item.name}
                        color="white"
                        backgroundColor={item?.colour || colors.primary}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: 'green',
                        }}>
                        {props.ticket?.stage?.id === item.id ? 'Current' : ''}
                      </Text>
                    </View>
                    {/* vertical Line */}
                    {index !== props.ticket?.queue_info?.stages.length - 1 && (
                      <View
                        style={{
                          minHeight: 20,
                          borderLeftColor: colors.bordergray,
                          borderLeftWidth: 1,
                          marginLeft: 20,
                          width: Dimensions.get('window').width - 90,
                        }}>
                        {/* filter from ticket?.queue?.content to find matching stage.id */}

                        <FlatList
                          data={
                            // filter from ticket?.queue?.content to find matching stage.id
                            props.ticket?.queue?.content?.filter(
                              (content: any) => content.stage?.id === item.id,
                            ) || []
                          }
                          ItemSeparatorComponent={() => <ASeperator />}
                          keyExtractor={(item, index) => index.toString()}
                          renderItem={({item}) => (
                            <View
                              style={{
                                display: 'flex',
                                justifyContent: 'flex-start',
                                alignItems: 'flex-start',
                                gap: 5,
                                padding: 10,
                                width: '100%',
                                borderWidth: 1,
                                marginLeft: 5,
                                borderRadius: 10,
                                borderColor: colors.borderLight,
                              }}>
                              {item?.comment && <Text>{item?.comment}</Text>}

                              <Text
                                style={{
                                  fontSize: 12,
                                  color: colors.gray2,
                                }}>
                                {moment(item?.date_achieved * 1000).format(
                                  'DD MMM YYYY hh:mm a',
                                )}{' '}
                                by {item?.performed_by?.username || 'System'}
                              </Text>
                            </View>
                          )}
                        />
                      </View>
                    )}
                  </View>
                )}
              />
            </ScrollView>

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
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ViewInfoModal;

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
