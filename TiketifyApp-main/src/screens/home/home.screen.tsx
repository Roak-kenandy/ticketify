import React from 'react';
import {
  Dimensions,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import {ScrollView} from 'react-native-gesture-handler';
import Snackbar from 'react-native-snackbar';
import {useDispatch, useSelector} from 'react-redux';
import colors from '../../constants/colors';
import MyProgress from './components/my-progress/my-progress';
import ProfileCard from './components/profile-card/profile-card';
import StatsCard from './components/stats-card/stats-card';
import UpcomingTickets from './components/upcoming-tickets/upcoming-tickets';
import {StatusBar} from 'react-native';

type Props = {
  navigation: any;
};

const HomeScreen = (props: Props) => {
  let dispatch = useDispatch();
  let [noNetwork, setNoNetwork] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshTrigger, setRefreshTrigger] = React.useState('');
  let [tickets, setTickets] = React.useState([]);
  let [teamTickets, setTeamTickets] = React.useState([]);
  const [isPolling, setIsPolling] = React.useState(false);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  let state = useSelector((state: any) => state.auth);

  function fetchMe() {
    console.log('URL:', `https://api.ticketify.medianet.mv/api/v1/users/me`);
    fetch(`https://api.ticketify.medianet.mv/api/v1/users/me`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + state?.token,
      },
    })
      .then(response => response.json())
      .then(data => {
        console.log('user data loaded');
        dispatch({
          type: 'USER_DATA',
          payload: data,
        });
        dispatch({
          type: 'USER_STATUS',
          payload: data?.availability,
        });
        console.log('user data loaded', JSON.stringify(data?.availability));
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

  function fetchTeamTickets() {
    fetch(`https://api.ticketify.medianet.mv/api/v1/tickets/teams`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + state?.token,
      },
    })
      .then(response => response.json())
      .then(data => {
        console.log(state?.token);
        console.log('team tickets loaded', data);
        setTeamTickets(data);
      })
      .catch(error => {
        if (error.message === 'Network request failed') {
          setNoNetwork(true);
        }
        Snackbar.show({
          backgroundColor: 'red',
          textColor: colors.white,
          text: error?.message,
          duration: Snackbar.LENGTH_LONG,
        });
      });
  }

  function fetchMyTickets() {
    fetch(`https://api.ticketify.medianet.mv/api/v1/tickets`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + state?.token,
      },
    })
      .then(response => response.json())
      .then(data => {
        if (data?.content) {
          console.log('user tickets loaded' + data);
        }
        console.log('user tickets loaded' + data?.content);
        setTickets(data?.content);
        dispatch({
          type: 'SET_TICKETS',
          payload: data?.content,
        });
      })
      .catch(error => {
        if (error.message === 'Network request failed') {
          Snackbar.show({
            backgroundColor: 'red',
            textColor: colors.white,
            text: error?.message,
            duration: Snackbar.LENGTH_INDEFINITE,
          });
          setNoNetwork(true);
        } else {
          Snackbar.show({
            backgroundColor: 'red',
            textColor: colors.white,
            text: error?.message,
            duration: Snackbar.LENGTH_LONG,
          });
        }
      });
  }

  // Function to refresh all data
  const refreshAllData = React.useCallback(() => {
    console.log('[HomeScreen] 🔄 Refreshing all data...');
    fetchMe();
    fetchMyTickets();
    fetchTeamTickets();
    setNoNetwork(false); // Reset network status on successful refresh
  }, [state?.token]);

  const onRefresh = React.useCallback(() => {
    console.log('[HomeScreen] 📲 Manual refresh triggered');
    setRefreshing(true);
    refreshAllData();
    setTimeout(() => {
      setRefreshing(false);
      setRefreshTrigger(Math.random().toString());
    }, 2000);
  }, [refreshAllData]);

  // Start polling when online
  const startPolling = React.useCallback(() => {
    if (intervalRef.current || !state?.isOnline) {
      return;
    }

    console.log('[HomeScreen] ⏰ Starting 30-second polling (user is online)');
    setIsPolling(true);

    intervalRef.current = setInterval(() => {
      console.log('[HomeScreen] 🔄 Polling: Fetching latest data...');
      refreshAllData();
    }, 30000); // Poll every 30 seconds
  }, [state?.isOnline, refreshAllData]);

  // Stop polling when offline
  const stopPolling = React.useCallback(() => {
    if (intervalRef.current) {
      console.log('[HomeScreen] ⏹️ Stopping polling (user went offline)');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsPolling(false);
    }
  }, []);

  // Initial data load and refresh trigger
  React.useEffect(() => {
    console.log(
      '[HomeScreen] 🚀 Initial data load or manual refresh triggered',
    );
    refreshAllData();
  }, [refreshTrigger, refreshAllData]);

  // Handle online/offline state changes
  React.useEffect(() => {
    console.log('[HomeScreen] 🌐 Online status changed:', {
      isOnline: state?.isOnline,
      isPolling: isPolling,
    });

    if (state?.isOnline) {
      // User came online - start polling
      startPolling();
    } else {
      // User went offline - stop polling
      stopPolling();
    }
  }, [state?.isOnline, startPolling, stopPolling]);

  // Cleanup on component unmount
  React.useEffect(() => {
    return () => {
      console.log('[HomeScreen] 🧨 Component unmounting, cleaning up polling');
      stopPolling();
    };
  }, [stopPolling]);

  return (
    <View style={styles.mainContainer}>
      <StatusBar backgroundColor={colors.primary} barStyle="light-content" />
      <ProfileCard navigation={props.navigation} />

      <View style={styles.container}>
        <View style={styles.subContainer}>
          <View
            style={{
              gap: 20,
            }}>
            {/* Header with title and refresh button */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 999,
              }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: colors.white,
                  flex: 1,
                }}>
                My Task Statistics {isPolling && '(• Auto-updating)'}
              </Text>

              {/* Manual Refresh Button */}
              <TouchableOpacity
                onPress={onRefresh}
                disabled={refreshing}
                style={[]}
                activeOpacity={0.7}>
                <Text
                  style={{
                    color: colors.white,
                    fontSize: 20,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}>
                  {refreshing ? '🔄' : '↻'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Offline indicator */}
            {!state?.isOnline && (
              <View style={{}}>
                <Text
                  style={{
                    color: colors.white,
                    fontSize: 12,
                    textAlign: 'center',
                    fontWeight: '600',
                  }}>
                  📵 You're offline - Pull down to refresh manually
                </Text>
              </View>
            )}

            <StatsCard navigation={props.navigation} tickets={tickets} />
          </View>
          {/* no network */}

          <ScrollView
            refreshControl={
              <RefreshControl
                style={{
                  zIndex: 999,
                }}
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]} // Android
                tintColor={colors.primary} // iOS
                title={
                  state?.isOnline
                    ? 'Refreshing...'
                    : 'Pull to refresh (offline)'
                }
                titleColor={colors.primary}
              />
            }
            contentContainerStyle={{
              gap: 20,
              height: Dimensions.get('window').height / 1.4,
              paddingBottom: 180,
            }}>
            {/* change upcoming tickets to Team tickets */}
            <UpcomingTickets
              tickets={teamTickets}
              navigation={props.navigation}
            />
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default HomeScreen;

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
    flex: 1,
    left: 20,
    right: 0,
    padding: 0,
    gap: 20,
    width: Dimensions.get('window').width - 40,
  },
  mainContainer: {
    backgroundColor: colors.white,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    color: colors.primary,
    gap: 20,
    flex: 1,
    position: 'relative',
  },
  overAbsolute: {
    position: 'absolute',
    top: 220,
    zIndex: 999,
    left: 0,
    right: 0,
    bottom: 0,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 65,

    height: 40,
    width: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
