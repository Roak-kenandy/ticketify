import {
  View,
  Text,
  ImageBackground,
  Image,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Linking,
  ScrollView,
  ScrollViewProps,
} from 'react-native';
import {
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import colors from '../../constants/colors';
import {useDispatch, useSelector} from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as KeyChain from 'react-native-keychain';
import {
  DrawerNavigationHelpers,
  DrawerDescriptorMap,
} from '@react-navigation/drawer/lib/typescript/src/types';
import {DrawerNavigationState, ParamListBase} from '@react-navigation/native';
import {JSX, RefAttributes} from 'react';

const CustomDrawer = (
  props:
    | (JSX.IntrinsicAttributes &
        ScrollViewProps & {
          children: React.ReactNode;
        } & RefAttributes<ScrollView>)
    | (JSX.IntrinsicAttributes & {
        state: DrawerNavigationState<ParamListBase>;
        navigation: DrawerNavigationHelpers;
        descriptors: DrawerDescriptorMap;
      }),
) => {
  let dispatch = useDispatch();
  let user = useSelector((state: any) => state.auth.user);
  return (
    <View style={{flex: 1}}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={{
          backgroundColor: colors.primary,
          marginTop: -50,
          zIndex: 10,
        }}>
        <ImageBackground style={{padding: 20}}>
          <Image
            alt="Not find"
            src={
              'https://img.freepik.com/premium-photo/memoji-happy-man-white-background-emoji_826801-6839.jpg'
            }
            style={styles.userAvatar}
          />
          <Text
            style={{
              color: '#fff',
              fontSize: 18,
              marginBottom: 5,
              fontWeight: 'bold',
            }}>
            {user?.name ?? 'Loading'}
          </Text>
          <Text style={{color: colors.gray2, fontSize: 15}}>
            {user?.email ?? 'Loading'}
          </Text>
        </ImageBackground>
        <View style={{flex: 1, backgroundColor: '#fff', paddingTop: 10}}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>
      <View style={{padding: 20, borderTopWidth: 1, borderTopColor: '#ccc'}}>
        <TouchableOpacity
          onPress={() => {
            // call support
            props.navigation.navigate('ChangePasswordScreen');
          }}
          style={{paddingVertical: 15}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text
              style={{
                fontSize: 15,

                marginLeft: 5,
              }}>
              Change Password
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            // call support
            Linking.openURL('tel:+9609993529');
          }}
          style={{paddingVertical: 15}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text
              style={{
                fontSize: 15,

                marginLeft: 5,
              }}>
              Contact Support
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            // remove user from redux
            await KeyChain.resetGenericPassword();
            await AsyncStorage.removeItem('user');
            await AsyncStorage.removeItem('token');
            await dispatch({
              type: 'LOGOUT',
            });
            props.navigation.navigate('LoginScreen');
          }}
          style={{paddingVertical: 15}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text
              style={{
                fontSize: 15,

                marginLeft: 5,
              }}>
              Sign Out
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CustomDrawer;

const styles = StyleSheet.create({
  userAvatar: {
    height: 67.5,
    width: 67.5,
    borderRadius: 40,
    marginBottom: 10,
    marginTop: 30,
  },
  switchTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 7,
    paddingVertical: 5,
  },
  preferences: {
    fontSize: 16,
    color: '#ccc',
    paddingTop: 10,
    fontWeight: '500',
    paddingLeft: 20,
  },
  switchText: {
    fontSize: 17,
    color: '',
    paddingTop: 10,
    fontWeight: 'bold',
  },
});
