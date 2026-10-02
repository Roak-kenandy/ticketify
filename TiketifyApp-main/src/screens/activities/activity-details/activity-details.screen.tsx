import moment from 'moment';
import React from 'react';
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useDispatch, useSelector} from 'react-redux';
import StackHeader from '../../../components/layout/stack-header';
import {ToneBadge} from '../../../components/ui/badge';
import PrimaryButton from '../../../components/ui/primary-button';
import {
  EmptyState,
  ErrorState,
  InlineBanner,
  Skeleton,
} from '../../../components/ui/state-views';
import colors from '../../../constants/colors';
import {radius, shadows, spacing, typography} from '../../../constants/styles';
import {
  priorityMeta,
  ticketStateMeta,
  Tone,
} from '../../../constants/ticket-meta';
import {
  notifyTicketMutation,
  sameTicketId,
} from '../../../services/ticketsSync';
import {apiGet, apiPut, fileImageSource} from '../../../utils/apiClient';
import {
  hasPendingLastMile,
  hasPendingNoResponse,
  lmStatusLabel,
  resolveCrmActivityState,
} from '../../../utils/crmActivityState';
import {showError, showInfo, showSuccess} from '../../../utils/notify';
import ActivityDetailModal from './modals/activity-details.modal';
import AddAttachmentModal from './modals/add-attachment.modal';
import AddNoteModal from './modals/add-note.modal';
import BillingWorkflowModal from './modals/billing-workflow.modal';
import ClosingModal from './modals/complete-ticket.modal';
import LmHandoffModal from './modals/lm-handoff.modal';
import ProgressTicketModal from './modals/progress-ticket.modal';
import ScheduleVisitModal from './modals/schedule-visit.modal';
import ViewImageModal from './modals/view-image.modal';
import ViewInfoModal from './modals/view-info.modal';

type Props = {
  navigation: any;
  route: any;
};

function findNextStage(ticket: any) {
  const order = ticket?.stage?.order ?? 0;
  return ticket?.queue_info?.stages?.find(
    (stage: any) => stage.order === order + 1,
  );
}

function crmDate(seconds?: number, format = 'DD MMM YYYY') {
  return seconds ? moment(seconds * 1000).format(format) : '';
}

const ActivityDetailsScreen = ({navigation, route}: Props) => {
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const token = useSelector((state: any) => state.auth?.token);
  const user = useSelector((state: any) => state.auth?.user);
  const routeTicket = route.params?.ticket;
  const ticket = React.useMemo(() => routeTicket ?? {}, [routeTicket]);

  const [data, setData] = React.useState<any>();
  const nextStage = React.useMemo(() => findNextStage(data), [data]);
  const [context, setContext] = React.useState<any>(null);
  const [billingWorkflow, setBillingWorkflow] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [noResponseBusy, setNoResponseBusy] = React.useState(false);

  const [selectedActivity, setSelectedActivity] = React.useState<any>();
  const [selectedImage, setSelectedImage] = React.useState<any>();
  const [modal, setModal] = React.useState<
    | null
    | 'activity'
    | 'attachment'
    | 'note'
    | 'image'
    | 'close'
    | 'progress'
    | 'schedule'
    | 'billing'
    | 'lm'
    | 'info'
  >(null);
  const modalSetter = (name: NonNullable<typeof modal>) => (value: boolean) =>
    setModal(value ? name : null);

  const storeTicket = useSelector((state: any) =>
    state.global.tickets.find((t: any) => sameTicketId(t.id, ticket?.id)),
  );

  const applyToLocalState = React.useCallback(
    (updated: any) => {
      if (!updated) {
        return;
      }
      setData((prev: any) => ({...(prev ?? ticket), ...updated}));
    },
    [ticket],
  );

  const fetchTicket = React.useCallback(async () => {
    const ticketData = await apiGet(`/tickets/${ticket.id}`, token);
    if (ticketData) {
      setData(ticketData);
    }
  }, [ticket?.id, token]);

  const fetchContext = React.useCallback(async () => {
    try {
      setContext(
        await apiGet(`/tickets/${ticket.id}/context`, token, {silent: true}),
      );
    } catch {
      // The context only drives blocking banners; the ticket itself still loads.
    }
  }, [ticket?.id, token]);

  const fetchBillingWorkflow = React.useCallback(async () => {
    try {
      setBillingWorkflow(
        await apiGet(`/billing/tickets/${ticket.id}/workflow`, token, {
          silent: true,
        }),
      );
    } catch {
      setBillingWorkflow(null);
    }
  }, [ticket?.id, token]);

  const loadAll = React.useCallback(
    async (mode: 'initial' | 'refresh' | 'quiet') => {
      if (!ticket?.id || !token) {
        return;
      }
      if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        await Promise.all([
          fetchTicket(),
          fetchContext(),
          fetchBillingWorkflow(),
        ]);
        setLoadError('');
      } catch (error: any) {
        const message = error?.message || 'Could not load this ticket';
        setLoadError(message);
        if (mode === 'refresh') {
          showError(message);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ticket?.id, token, fetchTicket, fetchContext, fetchBillingWorkflow],
  );

  React.useEffect(() => {
    loadAll('initial');
  }, [loadAll]);

  React.useEffect(() => {
    if (storeTicket) {
      applyToLocalState(storeTicket);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeTicket?.state, storeTicket?.stage?.order]);

  const refreshAfterChange = React.useCallback(
    () => loadAll('quiet'),
    [loadAll],
  );

  const view = data ?? ticket;
  const isMine =
    Boolean(user?.crm_user_id) &&
    user?.crm_user_id === view?.assigned_to?.user?.id;
  const isClosed = view?.state === 'CLOSED' || view?.stage?.name === 'Closed';
  const canEdit = isMine && !isClosed;
  const activities: any[] = data?.activities?.content ?? [];
  const notes: any[] = data?.notes?.content ?? [];
  const attachments: any[] = data?.attachments?.content ?? [];
  const services: any[] = data?.contact?.services?.content ?? [];
  const phone: string | undefined = data?.contact?.phone?.number;
  const customerName: string | undefined =
    data?.contact?.person_name?.full_name ||
    data?.contact?.company_name ||
    data?.contact?.name ||
    ticket?.contact?.name;

  const lmBlocking =
    Boolean(context?.pending_lm) || hasPendingLastMile(activities);
  const noResponseBlocking =
    Boolean(context?.pending_no_response) ||
    hasPendingNoResponse(context?.no_response_activities) ||
    hasPendingNoResponse(activities);
  const closeStageActive =
    Boolean(nextStage) && data?.queue_info?.stages?.length === nextStage?.order;
  const billingBlocksClose =
    isMine && billingWorkflow?.can_close_ticket === false && closeStageActive;

  async function assignUser() {
    setSubmitted(true);
    try {
      const assigned = await apiPut(
        `/tickets/${ticket.id}/assign`,
        undefined,
        token,
      );
      const updated = await notifyTicketMutation(
        dispatch,
        token,
        ticket.id,
        {state: assigned?.state ?? 'NEW'},
        assigned,
      );
      applyToLocalState(updated);
      showSuccess('Ticket assigned to you');
    } catch (error: any) {
      showError(error?.message || 'Could not assign the ticket');
    } finally {
      setSubmitted(false);
    }
  }

  async function startTroubleshooting() {
    setSubmitted(true);
    try {
      const result = await apiPut(
        `/tickets/${ticket.id}/start`,
        {stage_id: nextStage?.id},
        token,
        {timeoutMs: 30000},
      );
      if (result?.state !== 'IN_PROGRESS') {
        throw new Error(
          'The CRM did not move the ticket to In progress. Please try again.',
        );
      }
      const updated = await notifyTicketMutation(
        dispatch,
        token,
        ticket.id,
        {state: result.state, stage: result.stage ?? nextStage ?? data?.stage},
        {...view, ...result, id: ticket.id},
      );
      applyToLocalState(updated);
      showSuccess('Work started, ticket is In progress');
    } catch (error: any) {
      showError(error?.message || 'Could not start the ticket');
    } finally {
      setSubmitted(false);
    }
  }

  async function toggleNoResponse() {
    setNoResponseBusy(true);
    try {
      const result = await apiPut(
        `/tickets/${ticket.id}/no-response`,
        undefined,
        token,
      );
      showSuccess(result?.message || 'Updated');
      refreshAfterChange();
    } catch (error: any) {
      showError(error?.message || 'Could not update No response');
    } finally {
      setNoResponseBusy(false);
    }
  }

  function onPrimaryPress() {
    if (submitted) {
      return;
    }
    if (lmBlocking) {
      showInfo('Finish Last Mile cabling before continuing this ticket.');
      return;
    }
    if (!isMine) {
      assignUser();
      return;
    }
    if (view?.state === 'NEW') {
      startTroubleshooting();
      return;
    }
    if (closeStageActive) {
      if (noResponseBlocking) {
        showInfo('Clear No response before closing this ticket.');
        return;
      }
      if (billingBlocksClose) {
        showInfo(
          billingWorkflow?.block_close_reason ??
            'Complete charges and customer payment before closing.',
        );
        setModal('billing');
        return;
      }
      setModal('close');
      return;
    }
    setModal('progress');
  }

  const primaryLabel = lmBlocking
    ? 'Waiting for Last Mile'
    : !isMine
    ? 'Assign to me'
    : view?.state === 'NEW'
    ? `Start ${nextStage?.name ?? 'work'}`
    : closeStageActive
    ? 'Close ticket'
    : `Move to ${nextStage?.name ?? 'next stage'}`;

  const stateTone = ticketStateMeta(view?.state);
  const stageTone: Tone | null = view?.stage?.name
    ? {
        label: view.stage.name,
        color: colors.white,
        bg: view.stage.colour || colors.primary,
        icon: '',
      }
    : null;
  const address = [
    data?.contact?.addresses?.[0]?.address_line_1,
    data?.contact?.addresses?.[0]?.address_line_2,
    data?.contact?.addresses?.[0]?.town_city,
  ]
    .filter(Boolean)
    .join(', ');

  const firstLoad = loading && !data;

  if (!data && !loading && loadError) {
    return (
      <View style={styles.screen}>
        <StackHeader
          title={`#${ticket?.number ?? ''}`}
          onBack={() => navigation.goBack()}
        />
        <ErrorState message={loadError} onRetry={() => loadAll('initial')} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StackHeader
        title={view?.number ? `#${view.number}` : 'Ticket'}
        subtitle={view?.queue?.name ?? view?.queue_info?.name}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => setModal('info')}
            disabled={!data}
            accessibilityLabel="Ticket progress">
            <Icon name="git-commit-outline" size={22} color={colors.white} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAll('refresh')}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }>
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <ToneBadge tone={stateTone} showIcon />
            {stageTone ? <ToneBadge tone={stageTone} /> : null}
            {(data?.categories ?? []).map((tag: any, index: number) => (
              <ToneBadge
                key={`${tag?.name}-${index}`}
                tone={{
                  label: tag?.name,
                  color: colors.black,
                  bg: tag?.colour || colors.surface,
                  icon: '',
                }}
                size="sm"
              />
            ))}
          </View>
          {view?.description ? (
            <Text style={styles.description}>{view.description}</Text>
          ) : null}
          {firstLoad ? (
            <View style={styles.badgeRow}>
              <Skeleton width={90} height={22} rounded />
              <Skeleton width={90} height={22} rounded />
              <Skeleton width={90} height={22} rounded />
            </View>
          ) : data?.priority_matrix ? (
            <View style={styles.matrix}>
              {(['priority', 'urgency', 'impact'] as const).map(key => (
                <View key={key} style={styles.matrixCell}>
                  <Text style={styles.caption}>
                    {key[0].toUpperCase() + key.slice(1)}
                  </Text>
                  <ToneBadge
                    tone={priorityMeta(data.priority_matrix[key])}
                    size="sm"
                    showIcon
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {isMine && lmBlocking ? (
          <InlineBanner
            icon="git-network-outline"
            message="Last Mile cabling is in progress. Continue this ticket once Transport Network completes it."
          />
        ) : null}
        {isMine && noResponseBlocking ? (
          <InlineBanner
            tone="info"
            icon="call-outline"
            message="Marked as No response. Clear it before closing the ticket."
          />
        ) : null}
        {isMine &&
        view?.state === 'IN_PROGRESS' &&
        (billingWorkflow?.payment_status === 'pending' ||
          billingWorkflow?.payment_status === 'confirmed') ? (
          <InlineBanner
            tone={
              billingWorkflow.payment_status === 'confirmed'
                ? 'info'
                : 'warning'
            }
            icon="card-outline"
            message={
              billingWorkflow.payment_status === 'confirmed'
                ? `Payment received (${
                    billingWorkflow.confirmed_receipt_number ?? 'receipt'
                  }). Finish the work, then close the ticket.`
                : 'Waiting for the customer to pay the link that was sent.'
            }
            actionLabel={
              billingWorkflow.payment_status === 'pending' ? 'Open' : undefined
            }
            onAction={() => setModal('billing')}
          />
        ) : null}

        <Section title="Customer">
          <InfoRow icon="person-outline" label="Name" value={customerName} />
          {firstLoad ? (
            <>
              <Skeleton height={16} />
              <Skeleton height={16} width="70%" />
            </>
          ) : (
            <>
              <InfoRow
                icon="call-outline"
                label="Phone"
                value={phone}
                onPress={
                  phone ? () => Linking.openURL(`tel:${phone}`) : undefined
                }
              />
              <InfoRow
                icon="barcode-outline"
                label="Customer code"
                value={data?.contact?.code}
              />
              <InfoRow
                icon="location-outline"
                label="Address"
                value={address || 'No address on file'}
              />
            </>
          )}
          {services.length > 0 ? (
            <View style={styles.servicesWrap}>
              <Text style={styles.caption}>Services and devices</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.servicesRow}>
                {services.map((item: any, index: number) => (
                  <View
                    key={String(item?.id ?? index)}
                    style={styles.serviceCard}>
                    <Text style={styles.serviceName} numberOfLines={2}>
                      {item?.product?.name ?? 'Service'}
                    </Text>
                    <ToneBadge
                      size="sm"
                      tone={
                        item?.state === 'EFFECTIVE'
                          ? {
                              label: 'Active',
                              color: colors.success,
                              bg: colors.successBg,
                              icon: '',
                            }
                          : {
                              label: item?.state ?? 'Unknown',
                              color: colors.warning,
                              bg: colors.warningBg,
                              icon: '',
                            }
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Section>

        <Section
          title="Photos & attachments"
          count={attachments.length}
          actionLabel={canEdit ? 'Add' : undefined}
          onAction={() => setModal('attachment')}>
          {firstLoad ? (
            <View style={styles.thumbGrid}>
              <Skeleton width={96} height={96} />
              <Skeleton width={96} height={96} />
            </View>
          ) : attachments.length === 0 ? (
            <Text style={styles.muted}>No attachments yet</Text>
          ) : (
            <View style={styles.thumbGrid}>
              {attachments.map((item: any, index: number) => (
                <AttachmentThumb
                  key={String(item?.id ?? index)}
                  fileId={item?.file?.id}
                  token={token}
                  onPress={() => {
                    setSelectedImage(item);
                    setModal('image');
                  }}
                />
              ))}
            </View>
          )}
        </Section>

        <Section title="Activities" count={activities.length}>
          {firstLoad ? (
            <Skeleton height={56} />
          ) : activities.length === 0 ? (
            <Text style={styles.muted}>No activities</Text>
          ) : (
            activities.map((item: any, index: number) => {
              const done = resolveCrmActivityState(item) === 'COMPLETED';
              return (
                <TouchableOpacity
                  key={String(item?.id ?? index)}
                  style={styles.listItem}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedActivity(item);
                    setModal('activity');
                  }}>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item?.name ?? 'Activity'}
                    </Text>
                    <Text style={styles.caption}>
                      {[
                        item?.type?.name,
                        crmDate(item?.date ?? item?.activity_date?.date),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <ToneBadge
                    size="sm"
                    tone={
                      done
                        ? {
                            label: lmStatusLabel('COMPLETED'),
                            color: colors.success,
                            bg: colors.successBg,
                            icon: '',
                          }
                        : {
                            label: lmStatusLabel(resolveCrmActivityState(item)),
                            color: colors.warning,
                            bg: colors.warningBg,
                            icon: '',
                          }
                    }
                  />
                  <Icon name="chevron-forward" size={16} color={colors.gray3} />
                </TouchableOpacity>
              );
            })
          )}
        </Section>

        <Section
          title="Notes"
          count={notes.length}
          actionLabel={canEdit ? 'Add' : undefined}
          onAction={() => setModal('note')}>
          {firstLoad ? (
            <Skeleton height={56} />
          ) : notes.length === 0 ? (
            <Text style={styles.muted}>No notes yet</Text>
          ) : (
            notes.map((item: any, index: number) => (
              <View key={String(item?.id ?? index)} style={styles.note}>
                <Text style={styles.noteText}>{item?.note}</Text>
                <Text style={styles.caption}>
                  {crmDate(item?.created_on, 'DD MMM YYYY, h:mm A')}
                </Text>
              </View>
            ))
          )}
        </Section>

        {!firstLoad && !data ? (
          <EmptyState icon="alert-circle-outline" title="Details unavailable" />
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {paddingBottom: Math.max(insets.bottom, spacing.md)},
        ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {phone ? (
            <ActionChip
              icon="call-outline"
              label="Call"
              onPress={() => Linking.openURL(`tel:${phone}`)}
            />
          ) : null}
          {canEdit ? (
            <ActionChip
              icon="calendar-outline"
              label="Schedule"
              onPress={() => setModal('schedule')}
            />
          ) : null}
          {canEdit && view?.state === 'IN_PROGRESS' ? (
            <ActionChip
              icon="card-outline"
              label="Charges"
              onPress={() => setModal('billing')}
            />
          ) : null}
          {canEdit && view?.state === 'IN_PROGRESS' ? (
            <ActionChip
              icon={noResponseBlocking ? 'call' : 'call-outline'}
              label={noResponseBlocking ? 'Clear No response' : 'No response'}
              onPress={toggleNoResponse}
              busy={noResponseBusy}
              active={noResponseBlocking}
            />
          ) : null}
          {canEdit && !lmBlocking ? (
            <ActionChip
              icon="git-network-outline"
              label="Last Mile"
              onPress={() => setModal('lm')}
            />
          ) : null}
        </ScrollView>
        {!isClosed && data ? (
          <PrimaryButton
            text={primaryLabel}
            loading={submitted}
            disabled={
              lmBlocking || (isMine && closeStageActive && noResponseBlocking)
            }
            onPress={onPrimaryPress}
            style={
              isMine && nextStage?.colour && !closeStageActive
                ? {backgroundColor: nextStage.colour}
                : closeStageActive && isMine
                ? {backgroundColor: colors.success}
                : undefined
            }
          />
        ) : null}
      </View>

      <ActivityDetailModal
        modalVisible={modal === 'activity'}
        setModalVisible={modalSetter('activity')}
        activity={selectedActivity}
      />
      <AddAttachmentModal
        ticketId={ticket.id}
        modalVisible={modal === 'attachment'}
        setModalVisible={modalSetter('attachment')}
        onSuccess={refreshAfterChange}
      />
      <AddNoteModal
        modalVisible={modal === 'note'}
        setModalVisible={modalSetter('note')}
        ticketId={ticket.id}
        onSuccess={refreshAfterChange}
      />
      <ViewImageModal
        modalVisible={modal === 'image'}
        setModalVisible={modalSetter('image')}
        image={selectedImage}
      />
      <ClosingModal
        modalVisible={modal === 'close'}
        setModalVisible={modalSetter('close')}
        ticketId={ticket.id}
        nextStage={nextStage}
        onSuccess={applyToLocalState}
      />
      <ScheduleVisitModal
        modalVisible={modal === 'schedule'}
        setModalVisible={modalSetter('schedule')}
        ticketId={ticket.id}
        onSuccess={refreshAfterChange}
      />
      <BillingWorkflowModal
        visible={modal === 'billing'}
        onClose={() => setModal(null)}
        ticketId={ticket.id}
        token={token}
        onUpdated={refreshAfterChange}
      />
      <LmHandoffModal
        modalVisible={modal === 'lm'}
        setModalVisible={modalSetter('lm')}
        ticketId={ticket.id}
        onSuccess={refreshAfterChange}
      />
      {modal === 'progress' ? (
        <ProgressTicketModal
          modalVisible
          setModalVisible={modalSetter('progress')}
          ticket={data}
          setSubmitted={setSubmitted}
          nextStage={nextStage}
          isFirstStart={false}
          onSuccess={applyToLocalState}
        />
      ) : null}
      {modal === 'info' ? (
        <ViewInfoModal
          modalVisible
          setModalVisible={modalSetter('info')}
          ticket={data}
        />
      ) : null}
    </View>
  );
};

export default ActivityDetailsScreen;

function Section({
  title,
  count,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {title}
          {typeof count === 'number' && count > 0 ? (
            <Text style={styles.sectionCount}>{`  ${count}`}</Text>
          ) : null}
        </Text>
        {actionLabel && onAction ? (
          <TouchableOpacity style={styles.sectionAction} onPress={onAction}>
            <Icon name="add" size={16} color={colors.primary} />
            <Text style={styles.sectionActionText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.infoRow}>
      <Icon name={icon} size={18} color={colors.gray2} />
      <View style={styles.flex}>
        <Text style={styles.caption}>{label}</Text>
        <Text style={[styles.infoValue, onPress && styles.link]}>
          {value || '—'}
        </Text>
      </View>
      {onPress ? <Icon name="call" size={18} color={colors.info} /> : null}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

function AttachmentThumb({
  fileId,
  token,
  onPress,
}: {
  fileId?: string;
  token?: string;
  onPress: () => void;
}) {
  const [failed, setFailed] = React.useState(false);
  const source = fileImageSource(fileId, token);
  return (
    <TouchableOpacity
      style={styles.thumb}
      onPress={onPress}
      activeOpacity={0.85}>
      {source && !failed ? (
        <Image
          style={styles.thumbImage}
          source={source}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name="document-attach-outline" size={28} color={colors.gray3} />
      )}
    </TouchableOpacity>
  );
}

function ActionChip({
  icon,
  label,
  onPress,
  busy,
  active,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  busy?: boolean;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}>
      <Icon
        name={icon}
        size={16}
        color={active ? colors.white : colors.primary}
      />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {busy ? 'Please wait…' : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  flex: {flex: 1},
  content: {padding: spacing.lg, gap: spacing.md},
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  description: {...typography.body, lineHeight: 22},
  matrix: {flexDirection: 'row', gap: spacing.md},
  matrixCell: {flex: 1, gap: spacing.xs},
  caption: {...typography.caption},
  muted: {...typography.bodySm},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {...typography.h3, fontSize: 16},
  sectionCount: {color: colors.gray3, fontWeight: '600', fontSize: 14},
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.tertiary,
  },
  sectionActionText: {color: colors.primary, fontWeight: '700', fontSize: 13},
  infoRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  infoValue: {...typography.body, fontSize: 14, marginTop: 1},
  link: {color: colors.info, fontWeight: '600'},
  servicesWrap: {gap: spacing.sm},
  servicesRow: {gap: spacing.sm},
  serviceCard: {
    width: 150,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  serviceName: {fontSize: 13, fontWeight: '600', color: colors.black},
  thumbGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {width: '100%', height: '100%'},
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  itemTitle: {fontSize: 14, fontWeight: '600', color: colors.black},
  note: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  noteText: {...typography.body, fontSize: 14, lineHeight: 20},
  footer: {
    backgroundColor: colors.white,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  chips: {gap: spacing.sm},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.bordergray,
    backgroundColor: colors.white,
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontSize: 13, fontWeight: '600', color: colors.primary},
  chipTextActive: {color: colors.white},
});
