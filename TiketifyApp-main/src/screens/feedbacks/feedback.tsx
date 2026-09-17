import {StyleSheet, Text, View} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';
import Icon from 'react-native-vector-icons/Ionicons';
import moment from 'moment';
import {TouchableOpacity} from 'react-native-gesture-handler';

type Props = {
  navigation: any;
  data: {
    feedback: {
      feedback: string;
      rating: number;
      created_at: string;
    };
    ticket: {
      number: string;
      contact: {
        person_name: {
          full_name: string;
        };
      };
    };
  };
};

const FeedBack = (props: Props) => {
  return (
    <View
      style={{
        paddingVertical: 10,
        gap: 10,
      }}>
      {/* Stars */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <Text
          style={{
            fontWeight: 'bold',
            fontSize: 16,
          }}>
          {props?.data?.ticket?.number ?? 'No Ticket Number'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            props.navigation.navigate('ActivityDetailsScreen', {
              ticket: props.data.ticket,
            });
          }}>
          <Icon name="arrow-forward" size={20} />
        </TouchableOpacity>
      </View>
      <View style={{flexDirection: 'row'}}>
        {/* create an array with the same amount of rating */}
        {[...Array(5)].map((_, i) => (
          <Icon
            key={i}
            name="star"
            size={20}
            color={
              i < props.data.feedback.rating
                ? colors.secondary
                : colors.borderLight
            }
          />
        ))}
      </View>
      <Text
        style={{
          fontSize: 16,
          color: 'gray',
        }}>
        {props.data.feedback.feedback}
      </Text>
      <View
        style={{
          gap: 5,
        }}>
        <Text
          style={{
            fontWeight: '600',
          }}>
          {props.data.ticket.contact.person_name.full_name ?? 'Customer Name'}
        </Text>
        <Text>
          {moment(props.data.feedback.created_at).format('MMMM Do YYYY')}
        </Text>
      </View>
    </View>
  );
};

export default FeedBack;

const styles = StyleSheet.create({});
