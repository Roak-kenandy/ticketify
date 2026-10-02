import React from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import moment from 'moment';
import {useSelector} from 'react-redux';
import FormModal, {formStyles} from '../../../../components/modal/form-modal';
import {DateChips} from '../../../../components/ui/date-time-chips';
import {
  EmptyState,
  ErrorState,
  Skeleton,
} from '../../../../components/ui/state-views';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';
import {apiGet, apiPost} from '../../../../utils/apiClient';
import {showError, showSuccess} from '../../../../utils/notify';

const RESOLUTION_DAYS = [3, 5, 7, 10, 14];

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: string | number;
  onSuccess?: () => void;
};

const LmHandoffModal = (props: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [ctx, setCtx] = React.useState<any>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [activityDate, setActivityDate] = React.useState(
    moment().format('YYYY-MM-DD'),
  );
  const [resolutionDays, setResolutionDays] = React.useState(7);
  const [notifyCustomer, setNotifyCustomer] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!props.ticketId || !token) {
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiGet(`/tickets/${props.ticketId}/lm/context`, token);
      setCtx(data);
      const primary =
        data?.addresses?.find((a: any) => a.is_primary) ?? data?.addresses?.[0];
      setAddressId(primary?.id ?? null);
      const sr = data?.ticket_number ?? '';
      setName(current => current || (sr ? `LM cabling — ${sr}` : 'LM cabling'));
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the Last Mile form');
    } finally {
      setLoading(false);
    }
  }, [props.ticketId, token]);

  React.useEffect(() => {
    if (props.modalVisible) {
      setError('');
      load();
    }
  }, [props.modalVisible, load]);

  async function submitHandoff() {
    if (!addressId) {
      setError('Select the site address.');
      return;
    }
    if (!name.trim() || !description.trim()) {
      setError('Name and description are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const body: Record<string, string | number | boolean> = {
        name: name.trim(),
        description: description.trim(),
        address_id: addressId,
        activity_date: activityDate,
        resolution_days: resolutionDays,
        notify_customer: notifyCustomer,
      };
      if (notes.trim()) {
        body.notes = notes.trim();
      }
      const result: any = await apiPost(
        `/tickets/${props.ticketId}/lm/handoff`,
        body,
        token,
        {timeoutMs: 45000},
      );
      if (notifyCustomer && result?.sms_sent === false) {
        showSuccess(
          'Handed over to Last Mile (customer SMS could not be sent)',
        );
      } else {
        showSuccess(
          notifyCustomer
            ? 'Handed over to Last Mile. Customer notified by SMS.'
            : 'Handed over to Last Mile',
        );
      }
      setDescription('');
      setNotes('');
      props.setModalVisible(false);
      props.onSuccess?.();
    } catch (err: any) {
      showError(err?.message || 'Handoff failed');
    } finally {
      setSubmitting(false);
    }
  }

  const addresses: any[] = ctx?.addresses ?? [];

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={() => props.setModalVisible(false)}
      title="Hand over to Last Mile"
      subtitle="Creates a cabling activity for the Transport Network team pool."
      loading={submitting}
      footer={
        loadError
          ? undefined
          : {
              onSubmit: submitHandoff,
              submitText: 'Hand over',
              submitDisabled: loading,
            }
      }>
      {loadError ? (
        <ErrorState message={loadError} onRetry={load} compact />
      ) : loading ? (
        <View style={styles.skeleton}>
          <Skeleton height={48} />
          <Skeleton height={96} />
          <Skeleton height={56} />
        </View>
      ) : (
        <>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Activity name</Text>
            <TextInput
              style={formStyles.input}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.gray3}
            />
          </View>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Description</Text>
            <TextInput
              style={formStyles.textArea}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="What cabling work is needed?"
              placeholderTextColor={colors.gray3}
            />
          </View>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Notes (optional)</Text>
            <TextInput
              style={[formStyles.textArea, styles.shortArea]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={colors.gray3}
            />
          </View>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Visit day</Text>
            <DateChips
              value={activityDate}
              onChange={setActivityDate}
              days={14}
            />
          </View>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Expected resolution</Text>
            <View style={styles.chips}>
              {RESOLUTION_DAYS.map(days => {
                const active = resolutionDays === days;
                return (
                  <TouchableOpacity
                    key={days}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setResolutionDays(days)}
                    accessibilityRole="radio"
                    accessibilityState={{selected: active}}>
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}>
                      {days} working days
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={[formStyles.field, styles.switchRow]}>
            <View style={styles.flex}>
              <Text style={styles.optionTitle}>Send SMS to customer</Text>
              <Text style={styles.optionSub}>
                Tells the customer the ticket is with the Last Mile team and
                will be resolved within {resolutionDays} working days.
              </Text>
            </View>
            <Switch
              value={notifyCustomer}
              onValueChange={setNotifyCustomer}
              trackColor={{true: colors.primary, false: colors.borderLight}}
            />
          </View>
          <View style={formStyles.field}>
            <Text style={formStyles.label}>Site address</Text>
            {addresses.length === 0 ? (
              <EmptyState
                compact
                icon="location-outline"
                title="No addresses on file"
                message="Add an address to the customer in the CRM first."
              />
            ) : (
              addresses.map((addr: any) => {
                const active = addressId === addr.id;
                return (
                  <TouchableOpacity
                    key={addr.id}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => setAddressId(addr.id)}
                    accessibilityRole="radio"
                    accessibilityState={{selected: active}}>
                    <Icon
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={active ? colors.primary : colors.gray3}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.optionTitle}>
                        {addr.type ?? 'Address'}
                        {addr.is_primary ? ' · Primary' : ''}
                      </Text>
                      <Text style={styles.optionSub}>
                        {[addr.address_line_1, addr.town_city]
                          .filter(Boolean)
                          .join(', ') || 'No address details'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
          {error ? <Text style={formStyles.error}>{error}</Text> : null}
        </>
      )}
    </FormModal>
  );
};

export default LmHandoffModal;

const styles = StyleSheet.create({
  flex: {flex: 1},
  skeleton: {gap: spacing.md},
  shortArea: {minHeight: 72},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  optionActive: {borderColor: colors.primary, backgroundColor: colors.infoBg},
  optionTitle: {fontWeight: '600', color: colors.black, fontSize: 14},
  optionSub: {fontSize: 12, color: colors.gray2, marginTop: 2},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipActive: {borderColor: colors.primary, backgroundColor: colors.infoBg},
  chipText: {fontSize: 13, color: colors.gray2},
  chipTextActive: {color: colors.primary, fontWeight: '600'},
  switchRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
});
