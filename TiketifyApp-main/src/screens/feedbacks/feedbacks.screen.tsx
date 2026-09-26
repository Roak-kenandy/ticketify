import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import React from 'react';
import colors from '../../constants/colors';
import FeedBack from './feedback';
import {showError} from '../../utils/notify';
import {useDispatch, useSelector} from 'react-redux';
import {apiGet} from '../../utils/apiClient';
import {useFocusEffect} from '@react-navigation/native';
import {clearStoredSession} from '../../utils/session';
import ScreenHeader from '../../components/layout/screen-header';
import {spacing} from '../../constants/styles';

type Props = {
  navigation: any;
};

/** Show last list immediately; refresh in background on each visit */
let cachedFeedbacks: any[] = [];
let fetchInFlight: Promise<void> | null = null;

const FeedbacksScreen = (props: Props) => {
  const dispatch = useDispatch();
  const [feedbacks, setFeedbacks] = React.useState<any[]>(cachedFeedbacks);
  const [refreshing, setRefreshing] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(
    cachedFeedbacks.length === 0,
  );
  const token = useSelector((state: any) => state.auth?.token);

  const loadFeedbacks = React.useCallback(
    async (options?: {silent?: boolean; force?: boolean}) => {
      if (!token) {
        return;
      }

      if (fetchInFlight && !options?.force) {
        return fetchInFlight;
      }

      const showSpinner =
        !options?.silent && (options?.force || cachedFeedbacks.length === 0);

      if (showSpinner) {
        setRefreshing(true);
      }
      if (cachedFeedbacks.length === 0) {
        setInitialLoading(true);
      }

      fetchInFlight = (async () => {
        try {
          const data = await apiGet('/feedbacks', token);
          const list = Array.isArray(data) ? data : [];
          cachedFeedbacks = list;
          setFeedbacks(list);
        } catch (error: any) {
          if (error?.status === 401) {
            await clearStoredSession(dispatch);
            return;
          }
          if (!options?.silent) {
            showError(error?.message || 'Failed to fetch feedbacks');
          }
        } finally {
          setInitialLoading(false);
          if (showSpinner) {
            setRefreshing(false);
          }
          fetchInFlight = null;
        }
      })();

      return fetchInFlight;
    },
    [dispatch, token],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (cachedFeedbacks.length > 0) {
        setFeedbacks(cachedFeedbacks);
      }
      loadFeedbacks({silent: true});
    }, [loadFeedbacks]),
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Feedbacks"
        subtitle="Customer reviews on your work"
        onMenuPress={() => props.navigation.openDrawer()}
      />

      {initialLoading && feedbacks.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadFeedbacks({silent: false, force: true})}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          data={feedbacks}
          keyExtractor={(item: any, index) =>
            String(item?.feedback?.id ?? item?.id ?? index)
          }
          renderItem={({item}) => (
            <FeedBack navigation={props.navigation} data={item} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No feedbacks yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export default FeedbacksScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  list: {flex: 1},
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    padding: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.gray2,
    fontSize: 14,
  },
});
