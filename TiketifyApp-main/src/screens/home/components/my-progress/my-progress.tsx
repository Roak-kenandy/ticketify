import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../../../../constants/colors';

type Props = {
  tickets: any;
};

const MyProgress = (props: Props) => {
  return (
    <View
      style={{
        gap: 14,
      }}>
      <Text style={[{fontSize: 18, fontWeight: 'bold', color: colors.black}]}>
        My Progress
      </Text>
      <View style={styles.container}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 10,
          }}>
          <Text style={[styles.text, {fontSize: 18, fontWeight: 'bold'}]}>
            {
              props.tickets?.filter((ticket: any) => ticket.state === 'CLOSED')
                ?.length
            }
            / 10
          </Text>
          <Text style={[styles.text, {fontSize: 12}]}>
            Tickets left to reach daily goal
          </Text>
        </View>

        {/* bar */}
        <View
          style={{
            width: '100%',
            height: 10,
            backgroundColor: colors.white,
            borderRadius: 20,
            overflow: 'hidden',
          }}>
          <View
            style={{
              width: `${
                (props.tickets?.filter(
                  (ticket: any) => ticket.state === 'CLOSED',
                )?.length /
                  props.tickets?.length) *
                100
              }%`,
              height: '100%',
              backgroundColor: colors.secondary,
              shadowOpacity: 0.5,
              borderRadius: 20,
            }}></View>
        </View>
      </View>
    </View>
  );
};

export default MyProgress;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.primary,
    padding: 20,
    borderRadius: 20,
    gap: 10,
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  text: {
    color: colors.white,
  },
});
