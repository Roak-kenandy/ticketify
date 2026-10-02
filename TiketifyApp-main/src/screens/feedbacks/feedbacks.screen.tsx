import {useFocusEffect} from '@react-navigation/native';
import React from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSelector} from 'react-redux';
import ScreenHeader from '../../components/layout/screen-header';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../components/ui/state-views';
import colors from '../../constants/colors';
import {radius, shadows, spacing} from '../../constants/styles';
import {apiGet} from '../../utils/apiClient';
import {showError} from '../../utils/notify';
import FeedBack from './feedback';

type Props = {
  navigation: any;
};

/** Show the last list immediately; refresh in the background on each visit. */
let cachedFeedbacks: any[] | null = null;

const Separator = () => <View style={styles.separator} />;

const FeedbacksScreen = ({navigation}: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const [feedbacks, setFeedbacks] = React.useState<any[] | null>(
    cachedFeedbacks,
  );
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');
  const inFlight = React.useRef(false);

  const load = React.useCallback(
    async (mode: 'quiet' | 'refresh') => {
      if (!token || inFlight.current) {
        return;
      }
      inFlight.current = true;
      if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const data = await apiGet('/feedbacks', token, {
          silent: true,
          timeoutMs: 30000,
        });
        const list = Array.isArray(data) ? data : [];
        cachedFeedbacks = list;
        setFeedbacks(list);
        setError('');
      } catch (err: any) {
        const message = err?.message || 'Could not load reviews';
        setError(message);
        if (mode === 'refresh') {
          showError(message);
        }
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    React.useCallback(() => {
      load('quiet');
    }, [load]),
  );

  const summary = React.useMemo(() => {
    const list = feedbacks ?? [];
    if (list.length === 0) {
      return null;
    }
    const total = list.reduce(
      (sum, item) => sum + (Number(item?.feedback?.rating) || 0),
      0,
    );
    return {average: total / list.length, count: list.length};
  }, [feedbacks]);

  let empty: React.ReactElement;
  if (feedbacks === null && !error) {
    empty = (
      <View style={styles.skeletons}>
        {[0, 1, 2].map(i => (
          <View key={i} style={styles.skeletonCard}>
            <Skeleton width={110} height={16} />
            <Skeleton height={14} />
            <Skeleton width="60%" height={14} />
          </View>
        ))}
      </View>
    );
  } else if (feedbacks === null && error) {
    empty = <ErrorState message={error} onRetry={() => load('refresh')} />;
  } else {
    empty = (
      <EmptyState
        icon="star-outline"
        title="No reviews yet"
        message="When customers rate a ticket you closed, their review shows up here."
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Reviews"
        subtitle="What customers say about your work"
        onMenuPress={() => navigation.openDrawer()}
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={feedbacks ?? []}
        keyExtractor={(item: any, index) => String(item?.feedback?.id ?? index)}
        renderItem={({item}) => (
          <FeedBack navigation={navigation} data={item} />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          summary ? (
            <View style={styles.summary}>
              <Icon name="star" size={22} color={colors.secondary} />
              <Text style={styles.summaryValue}>
                {summary.average.toFixed(1)}
              </Text>
              <Text style={styles.summaryLabel}>
                average from {summary.count} review
                {summary.count === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
};

export default FeedbacksScreen;

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  listContent: {padding: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1},
  separator: {height: spacing.sm},
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  summaryValue: {fontSize: 22, fontWeight: '700', color: colors.black},
  summaryLabel: {fontSize: 13, color: colors.gray2, flex: 1},
  skeletons: {gap: spacing.sm},
  skeletonCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
