import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import React from 'react';
import {
  Dimensions,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import colors from '../../constants/colors';
import {useSelector} from 'react-redux';
import {FlatList} from 'react-native-gesture-handler';
import TicketCard from '../../components/ticket-card';
import ASeperator from '../../components/ui/seperator';
import Icon from 'react-native-vector-icons/Ionicons';

const Tab = createMaterialTopTabNavigator();

type Props = {
  navigation: any;
};

let {width} = Dimensions.get('window');

const ActivityScreen = (props: Props) => {
  let tickets = useSelector((state: any) => state.global.tickets);
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.primary,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.primary,
          paddingHorizontal: 10,
        }}>
        <TouchableOpacity
          style={{
            width: 45,
            borderRadius: 100,
            height: 45,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => props.navigation.openDrawer()}>
          <Icon
            name="menu"
            style={{
              color: colors.white,
              fontSize: 30,
            }}></Icon>
        </TouchableOpacity>
        <Text
          style={{
            padding: 20,
            fontSize: 30,
            color: colors.white,
            fontWeight: 'bold',
          }}>
          My Tickets
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          backgroundColor: 'white',
        }}>
        <Tab.Navigator
          sceneContainerStyle={{
            backgroundColor: 'white',
          }}
          screenOptions={{
            tabBarScrollEnabled: true,
            tabBarItemStyle: {
              height: 40,
              width: width / 3,
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.primary,
            },
            tabBarContentContainerStyle: {
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
            },

            tabBarLabel(props) {
              return (
                // Pills
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 35,
                    paddingHorizontal: 10,
                    borderRadius: 20,
                  }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: props.focused ? colors.white : colors.gray2,
                    }}>
                    {props.children}
                  </Text>
                </View>
              );
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: 'black',
            tabBarIndicatorStyle: {
              backgroundColor: colors.secondary,
            },
            tabBarStyle: {
              justifyContent: 'flex-start',
              paddingBottom: 10,

              elevation: 0,
              backgroundColor: colors.primary,
            },
          }}>
          <Tab.Screen
            name="Assigned"
            component={() => (
              <FlatList
                contentContainerStyle={{
                  gap: 10,
                  paddingTop: 10,
                }}
                data={
                  tickets?.filter((ticket: any) => ticket.state === 'NEW') ?? []
                }
                ItemSeparatorComponent={() => <ASeperator />}
                // if no data is available, show a message
                ListEmptyComponent={() => (
                  <View
                    style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: 20,
                    }}>
                    <Text>No tickets available</Text>
                  </View>
                )}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({item}) => (
                  <TicketCard ticket={item} navigation={props.navigation} />
                )}
              />
            )}
          />
          <Tab.Screen
            name="In Progress"
            component={() => (
              <FlatList
                contentContainerStyle={{
                  gap: 10,
                  paddingTop: 10,
                }}
                data={
                  tickets?.filter(
                    (ticket: any) => ticket.state === 'IN_PROGRESS',
                  ) ?? []
                }
                ItemSeparatorComponent={() => <ASeperator />}
                // if no data is available, show a message
                ListEmptyComponent={() => (
                  <View
                    style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: 20,
                    }}>
                    <Text>No tickets available</Text>
                  </View>
                )}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({item}) => (
                  <TicketCard ticket={item} navigation={props.navigation} />
                )}
              />
            )}
          />
          <Tab.Screen
            name="Completed"
            component={() => (
              <FlatList
                contentContainerStyle={{
                  gap: 10,
                  paddingTop: 10,
                }}
                data={
                  tickets?.filter((ticket: any) => ticket.state === 'CLOSED') ??
                  []
                }
                ItemSeparatorComponent={() => <ASeperator />}
                // if no data is available, show a message
                ListEmptyComponent={() => (
                  <View
                    style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: 20,
                    }}>
                    <Text>No tickets available</Text>
                  </View>
                )}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({item}) => (
                  <TicketCard ticket={item} navigation={props.navigation} />
                )}
              />
            )}
          />
        </Tab.Navigator>
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.white,
          height: 40,
        }}
      />
    </SafeAreaView>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({});
