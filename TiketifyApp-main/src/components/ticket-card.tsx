import {Pressable, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../constants/colors';
import ABadge from './ui/badge';
import Icon from 'react-native-vector-icons/Ionicons';
import moment from 'moment';

type Props = {
  navigation: any;
  ticket: {
    number: string;
    state: string;
    creation_date: number;
    priority: string;
    ref: string;
    type: 'relocation' | 'fault' | 'others';
    id: number;
    title: string;
    description: string;
    status: string;
    created_at: Date;
    updated_at: Date;
    queue: {
      id: number;
      name: string;
    };
    customer: {
      id: number;
      name: string;
      email: string;
      phone: string;
    };
    contact: {
      id: number;
      name: string;
      code: string;
      number: string;
    };
    stage: {
      id: number;
      name: string;
      colour: string;
    };
  };
};

const TicketCard = (props: Props) => {
  return (
    <Pressable
      onPress={() =>
        props.navigation.navigate('ActivityDetailsScreen', {
          ticket: props.ticket,
        })
      }
      style={styles.cardContainer}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          gap: 14,
        }}>
        {/* rounded */}
        <View
          style={{
            width: 50,
            height: 50,
            backgroundColor: colors.tertiary,
            borderRadius: 100,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <Icon
            name={
              props.ticket.type == 'fault'
                ? 'build-outline'
                : props.ticket.type == 'relocation'
                ? 'git-compare-outline'
                : 'disc-outline'
            }
            size={24}
            color={colors.primary}
          />
        </View>
        <View
          style={{
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: 5,
            width: '83%',
            position: 'relative',
          }}>
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              width: '100%',
              alignItems: 'center',
              gap: 10,
            }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: colors.black,
              }}>
              {props.ticket.number}
            </Text>
          </View>
          <View
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 5,
            }}>
            <ABadge
              title={`PRIORITY: ${props.ticket.priority}`}
              color={
                props.ticket.priority == 'URGENT'
                  ? 'red'
                  : props.ticket.priority == 'MEDIUM'
                  ? colors.secondary
                  : colors.primary
              }
              backgroundColor={colors.white}
            />
            <ABadge
              title={props.ticket.stage?.name || 'No Stage'}
              color={colors.white}
              backgroundColor={props.ticket?.stage?.colour || colors.primary}
            />
          </View>
          <Text style={{color: colors.gray2, fontSize: 12}}>
            {props.ticket.queue?.name || 'No Queue'}
          </Text>
          <Text
            numberOfLines={4}
            ellipsizeMode="middle"
            style={{
              fontSize: 12,
              color: colors.black,
              overflow: 'hidden',
              width: '100%',
              maxHeight: 40,
            }}>
            {props.ticket.description}
          </Text>
          <Text style={{color: colors.gray2, fontSize: 12}}>
            {props.ticket.contact?.name || 'No Contact'} - {props.ticket.contact?.code || 'N/A'}
          </Text>

          <Text style={{color: colors.gray2, fontSize: 12}}>
            {moment(props.ticket.creation_date * 1000).format(
              'DD MMMM YYYY hh:mm A',
            )}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default TicketCard;

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    backgroundColor: colors.white,
    padding: 14,
    borderRadius: 20,
    gap: 5,
    shadowColor: colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
});
