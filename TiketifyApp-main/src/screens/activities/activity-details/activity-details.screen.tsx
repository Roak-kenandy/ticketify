import moment from 'moment';
import React from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {ScrollView} from 'react-native-gesture-handler';
import {useSelector} from 'react-redux';
import BackButton from '../../../components/back-button/BackButton';
import ItemRender from '../../../components/item-render/item-render';
import ABadge from '../../../components/ui/badge';
import PrimaryButton from '../../../components/ui/primary-button';
import SecondaryButton from '../../../components/ui/secondary-button';
import ASeperator from '../../../components/ui/seperator';
import colors from '../../../constants/colors';
import {ServiceRequest} from '../../../types/service-request.type';
import AddActivityModal from './modals/add-activity.modal';
import AddAttachmentModal from './modals/add-attachment.modal';
import AddNoteModal from './modals/add-note.modal';
import ViewImageModal from './modals/view-image.modal';
import Snackbar from 'react-native-snackbar';
import ClosingModal from './modals/complete-ticket.modal';
import Icon from 'react-native-vector-icons/Ionicons';
import ViewInfoModal from './modals/view-info.modal';
import ProgressTicketModal from './modals/progress-ticket.modal';
import TertiaryButton from '../../../components/ui/tertiary-button';
import ActivityDetailModal from './modals/activity-details.modal';

type Props = {
  navigation: any;
  route: any;
  ticket: ServiceRequest;
};

let {width} = Dimensions.get('window');

const ActivityDetailsScreen = (props: Props) => {
  let auth = useSelector((state: any) => state.auth);

  let user = useSelector((state: any) => state.auth.user);
  let ticket = props.route.params.ticket;
  let [data, setData] = React.useState<ServiceRequest>();
  let state = useSelector((state: any) => state.auth);
  let [loading, setLoading] = React.useState(false);
  let [attachmentModalVisible, setAttachmentModalVisible] =
    React.useState(false);
  let [activityModalVisible, setActivityModalVisible] = React.useState(false);
  let [activityDetailsModalVisible, setActivityDetailsModalVisible] =
    React.useState(false);
  let [selectedActivity, setSelectedActivity] = React.useState<any>();
  let [noteModalVisible, setNoteModalVisible] = React.useState(false);
  let [viewImageModalVisible, setViewImageModalVisible] = React.useState(false);
  let [closeModalVisible, setCloseModalVisible] = React.useState(false);
  let [selectedImage, setSelectedImage] = React.useState<any>();
  let [viewInfoModalVisible, setViewInfoModalVisible] = React.useState(false);
  let [nextStage, setNextStage] = React.useState<any>();
  let [submitted, setSubmitted] = React.useState(false);
  let [progressTicketModalVisible, setProgressTicketModalVisible] =
    React.useState(false);

  const [context, setContext] = React.useState<any>(null);

  const fetchContext = () => {
    fetch(
      `https://api.ticketify.medianet.mv/api/v1/tickets/${props.ticket?.id}/context`,
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + auth?.token,
          'Content-Type': 'application/json',
        },
      },
    )
      .then(response => response.json())
      .then(data => {
        console.log('context data loaded', data);
        setContext(data);
      })
      .catch(error => {
        console.error('Error:', error);
        Snackbar.show({
          backgroundColor: colors.primary,
          textColor: colors.white,
          text: error?.message,
          duration: Snackbar.LENGTH_SHORT,
        });
      });
  };

  React.useEffect(() => {
    fetchContext();
  }, []);

  function fetchTicketById(id: number) {
    setLoading(true);
    fetch(`https://api.ticketify.medianet.mv/api/v1/tickets/${id}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + state?.token,
      },
    })
      .then(response => response.json())
      .then(data => {
        if (data) {
          console.log('user ticket Details loaded' + data);
          setData(data);
        }
        setNextStage(
          data?.queue_info?.stages.find(
            (stage: {order: number}) => stage.order === data?.stage?.order + 1,
          ),
        );
        setLoading(false);
      })
      .catch(error => {
        console.error('Error:', JSON.stringify(error));
        setLoading;
      });
  }

  function assignUser() {
    setSubmitted(true);
    console.log('assigning user....');
    fetch(
      `https://api.ticketify.medianet.mv/api/v1/tickets/${ticket?.id}/assign`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + state?.token,
        },
      },
    )
      .then(response => response.json())
      .then(data => {
        console.log('user assigned');
        setData(data);
        Snackbar.show({
          backgroundColor: 'green',
          textColor: colors.white,
          text: 'Ticket was assigned to you',
          duration: Snackbar.LENGTH_SHORT,
        });
        setSubmitted(false);
        props.navigation.navigate('HomeScreen');
      })
      .catch(error => {
        Snackbar.show({
          backgroundColor: colors.primary,
          textColor: colors.white,
          text: error?.message,
          duration: Snackbar.LENGTH_SHORT,
        });
        setSubmitted(false);
      });
  }

  function closeTicket() {
    setCloseModalVisible(true);
  }

  function progressTicket() {
    setProgressTicketModalVisible(true);
  }

  React.useEffect(() => {
    fetchTicketById(ticket?.id);
  }, [ticket?.id]);

  return (
    <SafeAreaView
      style={{
        flex: 1,

        backgroundColor: colors.primary,
      }}>
      <View style={styles.row}>
        <BackButton navigation={props.navigation} />
        <Text style={styles.title}>Ticket Details</Text>

        {/* View Ticket History */}
        <TouchableOpacity
          onPress={() => {
            setViewInfoModalVisible(true);
          }}>
          <Icon name="time-outline" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>
      <ScrollView
        refreshControl={
          <RefreshControl
            style={{
              zIndex: 999,
            }}
            refreshing={false}
            onRefresh={() => {
              fetchTicketById(ticket?.id);
            }}
          />
        }
        contentContainerStyle={{
          gap: 10,
          padding: 20,
          paddingBottom: 50,
          backgroundColor: colors.gray,
        }}>
        <View
          style={{
            gap: 10,
          }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                flexWrap: 'wrap',
              }}>
              <ABadge
                title={`${data?.stage?.name}`}
                color={colors.white}
                backgroundColor={data?.stage?.colour}
              />
              {data?.categories?.map(
                (tag: {name: string; colour: string}, index: number) => (
                  <ABadge
                    key={index}
                    title={tag.name}
                    color={colors.black}
                    backgroundColor={tag.colour}
                  />
                ),
              )}
            </View>

            <Text style={{color: colors.primary, fontSize: 12}}>
              {ticket?.queue?.name}
            </Text>
          </View>

          <Text
            style={[
              styles.title,
              {
                fontSize: 24,
                color: colors.black,
              },
            ]}>
            {ticket?.number}
          </Text>

          <Text>{ticket?.description}</Text>

          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              width: '100%',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}>
            <ABadge
              title={`Priority: ${
                data?.priority_matrix?.priority ?? 'Loading...'
              }`}
              color={
                data?.priority_matrix?.priority == 'URGENT'
                  ? 'red'
                  : data?.priority_matrix?.priority == 'MEDIUM'
                  ? colors.secondary
                  : colors.tertiary
              }
            />
            <ABadge
              title={`Urgency: ${
                data?.priority_matrix?.urgency ?? 'Loading...'
              }`}
              color={
                data?.priority_matrix?.urgency == 'URGENT'
                  ? 'red'
                  : data?.priority_matrix?.urgency == 'MEDIUM'
                  ? colors.secondary
                  : colors.black
              }
            />
            <ABadge
              title={`Impact: ${data?.priority_matrix?.impact ?? 'Loading...'}`}
              color={
                data?.priority_matrix?.impact == 'URGENT'
                  ? 'red'
                  : data?.priority_matrix?.impact == 'MEDIUM'
                  ? colors.secondary
                  : colors.black
              }
            />
          </View>
        </View>

        <ASeperator />

        <View style={{}}>
          <Text
            style={{
              fontWeight: '600',
            }}>
            Customer Information
          </Text>
          <View
            style={{
              gap: 10,
              paddingTop: 10,
              flexWrap: 'wrap',
              flexDirection: 'row',
              display: 'flex',
            }}>
            <ItemRender name="Name" value={ticket?.contact?.name} />
            <ItemRender
              name="Phone"
              value={data?.contact?.phone?.number ?? 'Loading...'}
            />
            <ItemRender
              name="Code"
              value={data?.contact?.code ?? 'Loading...'}
            />
            <ItemRender
              name="Address"
              value={`${data?.contact?.addresses?.[0]?.address_line_1 ?? 'No Address'}, ${
                data?.contact?.addresses?.[0]?.address_line_2 ?? ''
              } ${data?.contact?.addresses?.[0]?.town_city ?? ''}, ${
                data?.contact?.addresses?.[0]?.country_code ?? ''
              }`}
            />
            <View
              style={{
                gap: 5,
              }}>
              <Text
                style={{
                  fontSize: 10,
                }}>
                Given Services and Devices
              </Text>
              <FlatList
                data={data?.contact?.services?.content ?? []}
                keyExtractor={(item, index) => index.toString()}
                horizontal
                ItemSeparatorComponent={() => <ASeperator />}
                ListEmptyComponent={() => (
                  <Text
                    style={{
                      color: colors.black,
                      fontWeight: '600',
                      fontSize: 13,
                    }}>
                    No Services or Devices
                  </Text>
                )}
                renderItem={({item}) => (
                  <View
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      borderColor: colors.bordergray,
                      width: Dimensions.get('window').width / 2 - 20,
                    }}>
                    <Text>{item?.product?.name}</Text>
                    <ABadge
                      backgroundColor={
                        item?.state == 'EFFECTIVE' ? 'green' : colors.secondary
                      }
                      title={item?.state}
                      color={colors.white}
                    />
                  </View>
                )}
              />
            </View>
          </View>
        </View>

        <ASeperator />

        {/* Images and Attachments */}
        <View style={{}}>
          {/* Images */}
          <Text
            style={{
              color: colors.black,
              fontWeight: '600',
            }}>
            Images & Attachments ({data?.attachments?.content?.length})
          </Text>
          <FlatList
            contentContainerStyle={{
              width: '100%',
              paddingTop: 10,
            }}
            data={data?.attachments?.content ?? []}
            numColumns={3}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 5,
                }}></View>
            )}
            ListEmptyComponent={() => (
              <Text
                style={{
                  color: colors.black,
                  fontSize: 16,
                }}>
                No Images or Attachments
              </Text>
            )}
            renderItem={({item, index}) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedImage(item);
                  setViewImageModalVisible(true);
                }}>
                <Image
                  style={{
                    width: width / 3 - 20,
                    height: width / 3 - 20,
                    borderRadius: 10,
                    backgroundColor: colors.gray,
                    borderColor: colors.bordergray,
                    borderWidth: 1,
                    marginLeft: index % 3 == 0 ? 0 : 5,
                  }}
                  alt={item?.file_url}
                  source={{
                    uri: `https://app.crm.com/backoffice/v2/files/${item?.file.id}`,
                    headers: {
                      api_key: '67225f81-1d60-4401-b6d7-720f9cf68ba3',
                    },
                  }}
                />
              </TouchableOpacity>
            )}
          />

          <View
            style={{
              paddingTop: 10,
              zIndex: 999,
            }}>
            {user?.crm_user_id == data?.assigned_to?.user?.id &&
              data?.state != 'CLOSED' && (
                <SecondaryButton
                  text="+ Add Attachments"
                  onPress={() => {
                    setAttachmentModalVisible(true);
                  }}
                />
              )}
          </View>
        </View>

        <ASeperator />

        {/* activities */}
        <View style={{}}>
          <Text
            style={{
              fontWeight: '600',
              color: colors.black,
            }}>
            Activities
          </Text>
          <FlatList
            contentContainerStyle={{
              paddingTop: 10,
            }}
            data={data?.activities?.content ?? []}
            keyExtractor={(item, index) => index.toString()}
            ItemSeparatorComponent={() => <ASeperator />}
            // if no data is available, show a message
            ListEmptyComponent={() => (
              <View
                style={{
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 20,
                }}>
                <Text
                  style={{
                    color: colors.black,
                    fontWeight: '600',
                    fontSize: 16,
                  }}>
                  No activities available
                </Text>
              </View>
            )}
            renderItem={({item}) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedActivity(item);
                  setActivityDetailsModalVisible(true);
                }}
                style={{
                  gap: 10,
                  padding: 10,
                  borderRadius: 20,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  borderColor: colors.bordergray,
                }}>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                  <Text
                    style={{
                      fontWeight: '600',
                      marginRight: 5,
                      color: colors.black,
                    }}>
                    {item?.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.gray,
                    }}>
                    {moment(item?.activity_date.date * 1000).format(
                      'DD MMMM YYYY',
                    )}
                  </Text>
                </View>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                  <ABadge title={item?.type.name} color={item.type.colour} />
                </View>
              </TouchableOpacity>
            )}
          />
          <View
            style={{
              paddingTop: 10,
            }}>
            {user?.crm_user_id == data?.assigned_to?.user?.id &&
              data?.state != 'CLOSED' && (
                <SecondaryButton
                  text="+ Add Activity"
                  onPress={() => {
                    setActivityModalVisible(true);
                  }}
                />
              )}
          </View>
        </View>

        <ASeperator />

        {/* Notes */}
        <View style={{}}>
          <Text
            style={{
              fontWeight: '600',
              color: colors.black,
            }}>
            Notes
          </Text>
          <FlatList
            contentContainerStyle={{
              paddingTop: 10,
            }}
            data={data?.notes?.content ?? []}
            keyExtractor={(item, index) => index.toString()}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 10,
                }}
              />
            )}
            // if no data is available, show a message
            ListEmptyComponent={() => (
              <View
                style={{
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 20,
                }}>
                <Text
                  style={{
                    color: colors.black,
                  }}>
                  No Notes available
                </Text>
              </View>
            )}
            renderItem={({item}) => (
              <View
                style={{
                  gap: 10,
                  padding: 10,
                  borderRadius: 20,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  borderColor: colors.bordergray,
                }}>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                  <Text
                    style={{
                      fontWeight: '400',
                      marginRight: 5,
                      color: colors.black,
                    }}>
                    {item?.note ?? 'Loading...'}
                  </Text>
                </View>
                <View
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    alignItems: 'flex-end',
                  }}>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.black,
                    }}>
                    {moment(item?.created_on * 1000).format(
                      'DD MMMM YYYY hh:mm a',
                    )}
                  </Text>
                </View>
              </View>
            )}
          />
          <View
            style={{
              paddingTop: 10,
            }}>
            {user?.crm_user_id == data?.assigned_to?.user?.id &&
              data?.state != 'CLOSED' && (
                <SecondaryButton
                  text="+ Add Note"
                  onPress={() => {
                    setNoteModalVisible(true);
                  }}
                />
              )}
          </View>
        </View>

        {/* absolue bottom white */}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: -10,
          zIndex: 1999,
          paddingTop: 20,
          left: 0,
          backgroundColor: colors.gray,
          width: '100%',
          height: 170,
          paddingHorizontal: 20,
          gap: 10,
        }}>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}>
          {/* if the ticket is assigned to the current user, show the add attachment button */}

          {/* mark as no response if state in_progress */}
          {!loading && data?.state == 'IN_PROGRESS' && (
            <TertiaryButton
              style={{
                backgroundColor: data?.categories?.some(
                  (tag: {name: string}) => tag.name === 'No Response',
                )
                  ? colors.gray
                  : colors.white,
              }}
              onPress={() => {
                const responseTag: boolean = data?.tags?.some(
                  (tag: {name: string}) => tag.name === 'No Response',
                );
                if (responseTag) {
                  Snackbar.show({
                    backgroundColor: colors.primary,
                    textColor: colors.white,
                    text: 'Ticket already marked as No Response',
                    duration: Snackbar.LENGTH_SHORT,
                  });
                } else {
                  fetch(
                    `https://api.ticketify.medianet.mv/api/v1/tickets/${data?.id}/no-response`,
                    {
                      method: 'PUT',
                      headers: {
                        Authorization: 'Bearer ' + state?.token,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        name: 'No Response',
                      }),
                    },
                  )
                    .then(response => response.json())
                    .then(data => {
                      console.log(
                        'Ticket marked as No Response' + JSON.stringify(data),
                      );

                      Snackbar.show({
                        backgroundColor: 'green',
                        textColor: colors.white,
                        text: data?.message,
                        duration: Snackbar.LENGTH_SHORT,
                      });
                      fetchTicketById(ticket?.id);
                    })
                    .catch(error => {
                      console.error('Error:', error);
                      Snackbar.show({
                        backgroundColor: colors.primary,
                        textColor: colors.white,
                        text: error?.message,
                        duration: Snackbar.LENGTH_SHORT,
                      });
                    });
                }
              }}
              text={
                data.categories?.some(
                  (tag: {name: string}) => tag.name === 'No Response',
                )
                  ? 'Remove No Response'
                  : 'Mark as No Response'
              }
            />
          )}
          {/* if the ticket is assigned to the current user, show the close ticket button */}
          {!loading && (
            <TertiaryButton
              text="Call Customer"
              onPress={() => {
                Linking.openURL(`tel:${data?.contact?.phone?.number}`);
              }}
            />
          )}
        </View>
        {!loading && data?.stage?.name != 'Closed' && (
          <PrimaryButton
            style={{
              backgroundColor: nextStage?.colour ?? colors.primary,
            }}
            text={
              data?.assigned_to?.user?.id != user.crm_user_id
                ? 'Assign to Me' // if the ticket is not assigned to the current user
                : data?.state == 'NEW' // if the ticket is assigned to the current user and the state is new
                ? `Start ${nextStage?.name}`
                : // check if the next stage is the last stage
                data?.queue_info?.stages?.length == nextStage?.order
                ? `Close Ticket` // if the ticket is assigned to the current user and the state is in progress
                : `Start ${nextStage?.name}`
              // if the ticket is assigned to the current user and the state is in progress
              // if the ticket is assigned to the current user and the state is new
            }
            onPress={() => {
              data?.assigned_to?.user?.id != user.crm_user_id
                ? assignUser()
                : data?.state == 'NEW'
                ? progressTicket()
                : data?.queue_info?.stages?.length == nextStage?.order
                ? closeTicket()
                : progressTicket();
            }}
          />
        )}
      </View>

      <ActivityDetailModal
        modalVisible={activityDetailsModalVisible}
        setModalVisible={setActivityDetailsModalVisible}
        activity={selectedActivity}
      />

      <AddAttachmentModal
        ticketId={ticket?.id}
        navigation={props.navigation}
        modalVisible={attachmentModalVisible}
        setModalVisible={setAttachmentModalVisible}
        onSuccess={() => fetchTicketById(ticket?.id)}
      />
      <AddActivityModal
        ticketId={ticket?.id}
        contactId={ticket?.contact?.id}
        context={context}
        modalVisible={activityModalVisible}
        setModalVisible={setActivityModalVisible}
        onSuccess={() => fetchTicketById(ticket?.id)}
      />
      <AddNoteModal
        modalVisible={noteModalVisible}
        setModalVisible={setNoteModalVisible}
        ticketId={ticket?.id}
        onSuccess={() => fetchTicketById(ticket?.id)}
      />
      <ViewImageModal
        modalVisible={viewImageModalVisible}
        setModalVisible={setViewImageModalVisible}
        image={selectedImage}
      />
      <ClosingModal
        modalVisible={closeModalVisible}
        setModalVisible={setCloseModalVisible}
        ticketId={ticket?.id}
        nextStage={nextStage}
      />
      {progressTicketModalVisible && (
        <ProgressTicketModal
          modalVisible={progressTicketModalVisible}
          setModalVisible={setProgressTicketModalVisible}
          navigation={props.navigation}
          ticket={data}
          setSubmitted={setSubmitted}
          nextStage={nextStage}
        />
      )}

      {viewInfoModalVisible && (
        <ViewInfoModal
          modalVisible={viewInfoModalVisible}
          setModalVisible={setViewInfoModalVisible}
          ticket={data}
        />
      )}
    </SafeAreaView>
  );
};

export default ActivityDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 20,
    backgroundColor: colors.primary,
    position: 'relative',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
});
