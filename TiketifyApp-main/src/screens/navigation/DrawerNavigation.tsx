import {StyleSheet, Text, View} from 'react-native';
import {createDrawerNavigator} from '@react-navigation/drawer';

import React from 'react';
import CustomDrawer from '../../components/drawer/customer-drawer';
import HomeScreen from '../home/home.screen';
import FeedbacksScreen from '../feedbacks/feedbacks.screen';
import ActivityScreen from '../activities/activities.screen';

type Props = {};

const DrawerNavigation = () => {
  const Drawer = createDrawerNavigator();
  return (
    <Drawer.Navigator
      initialRouteName="HomeScreen"
      drawerContent={props => <CustomDrawer {...props} />}>
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{headerShown: false}}
      />
      <Drawer.Screen
        name="My Tickets"
        component={ActivityScreen}
        options={{headerShown: false}}
      />
      <Drawer.Screen
        name="Feedbacks"
        component={FeedbacksScreen}
        options={{headerShown: false}}
      />
    </Drawer.Navigator>
  );
};

export default DrawerNavigation;

const styles = StyleSheet.create({});
