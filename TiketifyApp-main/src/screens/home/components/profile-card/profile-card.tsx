import {
  Dimensions,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React from 'react';
import colors from '../../../../constants/colors';
import Icon from 'react-native-vector-icons/Ionicons';
import ABadge from '../../../../components/ui/badge';
import {useDispatch, useSelector} from 'react-redux';
import Snackbar from 'react-native-snackbar';
import Geolocation from '@react-native-community/geolocation';

type Props = {
  navigation: any;
};

let {width, height} = Dimensions.get('window');

const ProfileCard = (props: Props) => {
  let dispatch = useDispatch();
  let state = useSelector((state: any) => state.auth);
  let [buttonPressed, setButtonPressed] = React.useState<boolean>(false);

  function changeAvailability() {
    fetch(
      `https://api.ticketify.medianet.mv/api/v1/users/status?status=${
        state.isOnline ? 'UNAVAILABLEs' : 'AVAILABLE'
      }`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + state?.token,
        },
      },
    )
      .then(response => response.json())
      .then(data => {
        console.log(data);
        Snackbar.show({
          backgroundColor: state.isOnline ? 'red' : 'green',
          textColor: colors.white,
          text: state.isOnline ? 'You are now offline' : 'You are now online',
          duration: Snackbar.LENGTH_SHORT,
        });
        dispatch({
          type: 'USER_STATUS',
          payload: data?.availability,
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
      });
  }

  return (
    <SafeAreaView
      style={{
        backgroundColor: colors.primary,
      }}>
      <View style={styles.container}>
        <View
          style={{
            gap: 15,
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            style={{
              backgroundColor: colors.white,
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
                color: colors.black,
                fontSize: 30,
              }}></Icon>
          </TouchableOpacity>
          <View
            style={{
              backgroundColor: colors.primary,
            }}>
            <Text style={styles.heading}>{state?.user?.name ?? 'Loading'}</Text>
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
                paddingTop: 5,
              }}>
              <Text style={styles.text}>{state?.user?.email ?? 'Loading'}</Text>
              <ABadge
                title={state?.isOnline === true ? 'Online' : 'Offline'}
                color={state?.isOnline === true ? 'green' : 'red'}
              />
            </View>
          </View>
        </View>
        <View
          style={{
            padding: 10,
          }}>
          <Pressable
            onPress={() => setButtonPressed(!buttonPressed)}
            onLongPress={() => {
              changeAvailability();
            }}>
            <Icon
              size={40}
              name="power"
              style={{
                color: state?.isOnline === true ? 'green' : 'red',
              }}></Icon>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default ProfileCard;

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    display: 'flex',
    width: width,
    height: height / 5,
    paddingBottom: 100,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  text: {
    color: colors.gray2,
  },
});
