import {StyleSheet, View} from 'react-native';
import {createDrawerNavigator} from '@react-navigation/drawer';
import React from 'react';
import CustomDrawer from '../../components/drawer/customer-drawer';
import HomeScreen from '../home/home.screen';
import FeedbacksScreen from '../feedbacks/feedbacks.screen';
import ActivityScreen from '../activities/activities.screen';
import AccountScreen from '../settings/setttings.screen';
import colors from '../../constants/colors';
import {useAppData} from '../../hooks/useAppData';

// Module scope: creating the navigator inside render remounts every screen.
const Drawer = createDrawerNavigator();

function AppDataBootstrap() {
  useAppData('bootstrap');
  return null;
}

const renderDrawer = (props: any) => <CustomDrawer {...props} />;

const DrawerNavigation = () => {
  return (
    <View style={styles.root}>
      <AppDataBootstrap />
      <Drawer.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          overlayColor: 'rgba(15, 23, 42, 0.45)',
          drawerStyle: {width: 300, backgroundColor: colors.white},
        }}
        drawerContent={renderDrawer}>
        <Drawer.Screen name="Home" component={HomeScreen} />
        <Drawer.Screen name="My Tickets" component={ActivityScreen} />
        <Drawer.Screen name="Feedbacks" component={FeedbacksScreen} />
        <Drawer.Screen name="Account" component={AccountScreen} />
      </Drawer.Navigator>
    </View>
  );
};

export default DrawerNavigation;

const styles = StyleSheet.create({
  root: {flex: 1},
});
