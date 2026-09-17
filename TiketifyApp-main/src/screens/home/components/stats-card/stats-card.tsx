import React from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import colors from '../../../../constants/colors';

type Props = {
  tickets: any;
  navigation: any;
};

const StatsCard = (props: Props) => {
  return (
    <View style={styles.card}>
      <View style={styles.rowConatiner}>
        <View style={styles.statContainer}>
          <Text
            style={{
              color: colors.primary,
            }}>
            Assigned
          </Text>
          <Text style={styles.statValue}>
            {props.tickets?.filter((ticket: any) => ticket.state === 'NEW')
              ?.length ?? 0}
          </Text>
        </View>
        <View
          style={[
            styles.statContainer,
            {
              borderLeftWidth: 1,
              borderLeftColor: colors.gray2,
              borderRightWidth: 1,
              borderRightColor: colors.gray2,
              paddingHorizontal: 30,
            },
          ]}>
          <Text
            style={{
              color: 'green',
            }}>
            In Progress
          </Text>
          <Text style={styles.statValue}>
            {props.tickets?.filter(
              (ticket: any) => ticket.state === 'IN_PROGRESS',
            )?.length ?? 0}
          </Text>
        </View>
        <View style={styles.statContainer}>
          <Text
            style={{
              color: 'orange',
            }}>
            Completed
          </Text>
          <Text style={styles.statValue}>
            {props.tickets?.filter((ticket: any) => ticket.state === 'CLOSED')
              ?.length ?? 0}
          </Text>
        </View>
      </View>
      <View
        style={{
          gap: 10,
          marginTop: 10,
        }}>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 80,
            alignItems: 'center',
          }}>
          <Text
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 10,
              alignItems: 'center',
            }}>
            Current Task
          </Text>
          <TouchableOpacity
            onPress={() =>
              props.tickets?.filter(
                (ticket: any) => ticket.state === 'IN_PROGRESS',
              ).length === 0
                ? null
                : props.navigation.navigate('ActivityDetailsScreen', {
                    ticket: props.tickets?.filter(
                      (ticket: any) => ticket.state === 'IN_PROGRESS',
                    )[0],
                  })
            }>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              style={{
                fontSize: 12,
                color: colors.black,
                overflow: 'hidden',
                width: '80%',
                minWidth: 200,
                textAlign: 'right',
              }}>
              {props.tickets?.filter(
                (ticket: any) => ticket.state === 'IN_PROGRESS',
              )[0]?.description ?? 'No Task'}
            </Text>
          </TouchableOpacity>
        </View>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'center',
          }}>
          <Text>Next Task</Text>
          <TouchableOpacity
            style={{
              width: '80%',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
            onPress={() =>
              props.tickets?.filter((ticket: any) => ticket.state === 'NEW')
                .length === 0
                ? null
                : props.navigation.navigate('ActivityDetailsScreen', {
                    ticket: props.tickets?.filter(
                      (ticket: any) => ticket.state === 'NEW',
                    )[0],
                  })
            }>
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={{
                fontSize: 12,
                color: colors.black,
                overflow: 'hidden',
                width: 200,
                textAlign: 'right',
              }}>
              {props.tickets?.filter((ticket: any) => ticket.state === 'NEW')[0]
                ?.description ?? 'No Task'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default StatsCard;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: Dimensions.get('window').width,
    padding: 20,
  },
  subContainer: {
    zIndex: 999,
    position: 'absolute',
    top: -110,
    left: 20,
    right: 0,
    padding: 0,
    gap: 20,
    width: Dimensions.get('window').width - 40,
  },
  statContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 20,
    gap: 10,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowColor: '#000',
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
    // Elevation for Android
    elevation: 4,

    borderWidth: 2,
    borderColor: colors.gray,
  },
  rowConatiner: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 0,
  },
  heading: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statValue: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: 'bold',
    width: 50,
    textAlign: 'center',
  },
});
