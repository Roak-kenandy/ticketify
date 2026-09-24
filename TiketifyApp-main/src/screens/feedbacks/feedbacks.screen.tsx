import {
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

const FEEDBACK_COOLDOWN_MS = 60000;
let lastFeedbackFetchAt = 0;

const FeedbacksScreen = (props: Props) => {
  const dispatch = useDispatch();
  const [feedbacks, setFeedbacks] = React.useState<any[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const token = useSelector((state: any) => state.auth?.token);

  const loadFeedbacks = React.useCallback(
    async (options?: {silent?: boolean; force?: boolean}) => {
      if (!token) {
        return;
      }

      const now = Date.now();
      if (!options?.force && now - lastFeedbackFetchAt < FEEDBACK_COOLDOWN_MS) {
        return;
      }

      if (!options?.silent) {
        setRefreshing(true);
      }

      try {
        const data = await apiGet('/feedbacks', token);
        setFeedbacks(Array.isArray(data) ? data : []);
        lastFeedbackFetchAt = Date.now();
      } catch (error: any) {
        if (error?.status === 401) {
          await clearStoredSession(dispatch);
          return;
        }
        if (!options?.silent) {
          showError(error?.message || 'Failed to fetch feedbacks');
        }
      } finally {
        if (!options?.silent) {
          setRefreshing(false);
        }
      }
    },
    [dispatch, token],
  );

  useFocusEffect(
    React.useCallback(() => {
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
        keyExtractor={(item: any, index) => String(item?.id ?? index)}
        renderItem={({item}) => (
          <FeedBack navigation={props.navigation} data={item} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No feedbacks yet</Text>
          </View>
        }
      />
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
  empty: {
    padding: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.gray2,
    fontSize: 14,
  },
});
