import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';
import FeedBack from './feedback';
import Icon from 'react-native-vector-icons/Ionicons';
import Snackbar from 'react-native-snackbar';
import {useSelector} from 'react-redux';
import ASeperator from '../../components/ui/seperator';

type Props = {
  navigation: any;
};

const FeedbacksScreen = (props: Props) => {
  let [feedbacks, setFeedbacks] = React.useState([]);
  const [refreshing, setRefreshing] = React.useState(false);
  let auth = useSelector((state: any) => state.auth);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetch('https://api.ticketify.medianet.mv/api/v1/feedbacks', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + auth.token,
      },
    })
      .then(response => response.json())
      .then(data => {
        if (data.statusCode === 401) {
          Snackbar.show({
            text: 'Unauthorized',
            duration: Snackbar.LENGTH_SHORT,
            backgroundColor: 'red',
          });
          return;
        }

        setFeedbacks(data);
      })
      .catch(error => {
        Snackbar.show({
          text: 'Failed to fetch feedbacks',
          duration: Snackbar.LENGTH_SHORT,
        });
      });
    setTimeout(() => {
      setRefreshing(false);
      Snackbar.show({
        text: 'Refreshed',
        duration: Snackbar.LENGTH_SHORT,
      });
    }, 2000);
  }, []);

  React.useEffect(() => {
    // Fetch feedbacks from the server
    onRefresh();

    // setFeedbacks(response.data)
  }, []);

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
          My Feedbacks
        </Text>
      </View>

      <View
        style={{
          flex: 1,
          backgroundColor: 'white',
          padding: 20,
        }}>
        <FlatList
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{
            gap: 10,
            paddingBottom: 50,
          }}
          data={feedbacks}
          ItemSeparatorComponent={() => <ASeperator />}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({item}) => (
            <FeedBack navigation={props.navigation} data={item} />
          )}
        />
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

export default FeedbacksScreen;

const styles = StyleSheet.create({});
