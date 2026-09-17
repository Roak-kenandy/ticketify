import {FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import colors from '../../../../constants/colors';

type Props = {
  navigation: any;
};

const TeamTickets = (props: Props) => {
  return (
    <View
      style={{
        gap: 14,
      }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <Text style={[{fontSize: 18, fontWeight: 'bold', color: colors.black}]}>
          Team Assigned Tickets
        </Text>
        <TouchableOpacity
          onPress={() => props.navigation.navigate('My Tickets')}>
          <Text style={{color: colors.primary}}>View All</Text>
        </TouchableOpacity>
      </View>
      <View>
        <FlatList
          data={[]}
          keyExtractor={(item: {toString: () => any}) => item.toString()}
          ItemSeparatorComponent={() => <View style={{height: 10}} />}
          initialNumToRender={1}
          renderItem={({item}: any) => (
            <View>
              <View
                style={{
                  backgroundColor: colors.white,
                  padding: 10,
                  borderRadius: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <View>
                  <Text style={{fontSize: 16, fontWeight: 'bold'}}>
                    Ticket #1224
                  </Text>
                  <Text style={{color: colors.gray2}}>Relocation</Text>
                </View>
                <View>
                  <Text style={{color: colors.gray2}}>Open</Text>
                </View>
              </View>
              {/* Accept/Reject */}
              <View></View>
            </View>
          )}
        />
      </View>
    </View>
  );
};

export default TeamTickets;

const styles = StyleSheet.create({});
