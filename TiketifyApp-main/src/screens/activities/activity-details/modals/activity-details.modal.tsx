import React from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../../../constants/colors';
import {useSelector} from 'react-redux';
import moment from 'moment';
import ABadge from '../../../../components/ui/badge';
import ASeperator from '../../../../components/ui/seperator';
import {API_BASE_URL} from '../../../../config/api';

type Props = {
  activity: any;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
};

let {width, height} = Dimensions.get('window');

const ActivityDetailModal = (props: Props) => {
  let auth = useSelector((state: any) => state.auth);
  const [activityDetails, setActivityDetails] = React.useState<any>(null);

  const fetchActivityDetails = async () => {
    try {
      console.log('Fetching activity details for ID:', props.activity?.id);

      const response = await fetch(
        `${API_BASE_URL}/activities/${props.activity?.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + auth?.token,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      // Check if response is ok
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get response text first to debug
      const responseText = await response.text();

      // Check if response is empty
      if (!responseText || responseText.trim() === '') {
        throw new Error('Empty response from server');
      }

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error(
          'Failed to parse response:',
          responseText.substring(0, 200),
        );
        throw new Error(
          `Server returned invalid JSON. Response: ${responseText.substring(
            0,
            100,
          )}${responseText.length > 100 ? '...' : ''}`,
        );
      }

      setActivityDetails(data);
    } catch (error: any) {
      console.error('Error fetching activity details:', error);
      setActivityDetails({error: error?.message || 'Failed to load details'});
    }
  };

  React.useEffect(() => {
    if (props.modalVisible && props.activity?.id) {
      setActivityDetails(null);
      fetchActivityDetails();
    }
  }, [props.modalVisible, props.activity?.id]);

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
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Activity Details</Text>
              <TouchableOpacity
                onPress={() => props.setModalVisible(false)}
                style={styles.closeButton}>
                <Icon name="close" size={24} color={colors.black} />
              </TouchableOpacity>
            </View>

            <ASeperator />

            {/* Content */}

            {activityDetails ? (
              <View style={styles.contentContainer}>
                {/* Activity Name and Type */}

                {/* Description */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Description</Text>
                  <Text style={styles.sectionContent}>
                    {activityDetails.description}
                  </Text>
                </View>

                {/* Date and Time */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Scheduled Date</Text>
                  <Text style={styles.sectionContent}>
                    {moment(activityDetails.date * 1000).format(
                      'DD MMMM YYYY, dddd',
                    )}
                  </Text>
                  <Text style={styles.dateNote}>
                    Created:{' '}
                    {moment(activityDetails.created_date * 1000).format(
                      'DD MMM YYYY, hh:mm A',
                    )}
                  </Text>
                </View>

                {/* Assignment */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Assignment</Text>
                  <View style={styles.assignmentContainer}>
                    <Text style={styles.sectionContent}>
                      Team:{' '}
                      {activityDetails.assigned_to?.team?.name ||
                        'Not assigned'}
                    </Text>
                    {activityDetails.assigned_to?.user ? (
                      <Text style={styles.sectionContent}>
                        User: {activityDetails.assigned_to.user.name}
                      </Text>
                    ) : (
                      <Text style={styles.noAssignmentText}>
                        No user assigned
                      </Text>
                    )}
                  </View>
                </View>

                {/* Contact Information */}
                {activityDetails.contact && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Contact</Text>
                    <View style={styles.contactContainer}>
                      <Text style={styles.contactName}>
                        {activityDetails.contact.name}
                      </Text>
                      <Text style={styles.contactDetail}>
                        Code: {activityDetails.contact.code}
                      </Text>
                      {activityDetails.contact.phone && (
                        <Text style={styles.contactDetail}>
                          Phone: {activityDetails.contact.phone.number} (
                          {activityDetails.contact.phone.country_code})
                        </Text>
                      )}
                      {activityDetails.contact.primary_address && (
                        <Text style={styles.contactDetail}>
                          Address:{' '}
                          {
                            activityDetails.contact.primary_address
                              .address_line_1
                          }
                          , {activityDetails.contact.primary_address.town_city}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Service Request */}
                {activityDetails.service_request && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Linked Service Request
                    </Text>
                    <Text style={styles.serviceRequestNumber}>
                      #{activityDetails.service_request.number}
                    </Text>
                    <Text style={styles.serviceRequestId}>
                      ID: {activityDetails.service_request.id}
                    </Text>
                  </View>
                )}

                {/* Status */}
                {activityDetails.states &&
                  activityDetails.states.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Status</Text>
                      <View style={styles.statusContainer}>
                        <ABadge
                          title={
                            activityDetails.states[
                              activityDetails.states.length - 1
                            ].state
                          }
                          color={colors.primary}
                        />
                        <Text style={styles.statusDate}>
                          Since:{' '}
                          {moment(
                            activityDetails.states[
                              activityDetails.states.length - 1
                            ].date * 1000,
                          ).format('DD MMM YYYY, hh:mm A')}
                        </Text>
                      </View>
                    </View>
                  )}

                {/* Custom Fields */}
                {activityDetails.custom_fields &&
                  activityDetails.custom_fields.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Custom Fields</Text>
                      {activityDetails.custom_fields.map((field, index) => (
                        <View key={index} style={styles.customFieldContainer}>
                          <Text style={styles.customFieldLabel}>
                            {field.label}:
                          </Text>
                          <Text style={styles.customFieldValue}>
                            {field.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
              </View>
            ) : (
              <View style={styles.loadingContainer}>
                {activityDetails?.error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>
                      Error: {activityDetails.error}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.loadingText}>Loading...</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ActivityDetailModal;

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalView: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.black,
  },
  closeButton: {
    padding: 5,
    borderRadius: 10,
  },
  scrollContainer: {
    width: '100%',
    flex: 1,
  },
  contentContainer: {
    width: '100%',
    paddingBottom: 20,
  },
  section: {
    marginBottom: 20,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.black,
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 14,
    color: colors.black,
    lineHeight: 20,
  },
  activityName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.black,
    marginBottom: 10,
  },
  dateNote: {
    fontSize: 12,
    color: colors.gray2,
    marginTop: 4,
    fontStyle: 'italic',
  },
  assignmentContainer: {
    gap: 4,
  },
  noAssignmentText: {
    fontSize: 14,
    color: colors.gray2,
    fontStyle: 'italic',
  },
  contactContainer: {
    backgroundColor: colors.gray + '30',
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.black,
  },
  contactDetail: {
    fontSize: 14,
    color: colors.black,
  },
  serviceRequestNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  serviceRequestId: {
    fontSize: 12,
    color: colors.gray2,
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDate: {
    fontSize: 12,
    color: colors.gray2,
  },
  customFieldContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  customFieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.black,
  },
  customFieldValue: {
    fontSize: 14,
    color: colors.black,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.gray2,
  },
  errorContainer: {
    padding: 20,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#c62828',
    textAlign: 'center',
  },
});
