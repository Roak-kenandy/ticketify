import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import moment from 'moment';
import colors from '../../../../constants/colors';
import ModalFooterActions from '../../../../components/ui/modal-footer-actions';
import Snackbar from 'react-native-snackbar';
import {useSelector} from 'react-redux';
import {apiFetch, apiGet} from '../../../../utils/apiClient';

type Props = {
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: string | number;
  onSuccess?: () => void;
};

const LmHandoffModal = (props: Props) => {
  const auth = useSelector((state: any) => state.auth);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [ctx, setCtx] = React.useState<any>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [activityDate, setActivityDate] = React.useState(
    moment().format('YYYY-MM-DD'),
  );

  React.useEffect(() => {
    if (!props.modalVisible || !props.ticketId || !auth?.token) {
      return;
    }
    setLoading(true);
    apiGet(`/tickets/${props.ticketId}/lm/context`, auth.token)
      .then(data => {
        setCtx(data);
        const primary =
          data?.addresses?.find((a: any) => a.is_primary) ??
          data?.addresses?.[0];
        if (primary?.id) {
          setAddressId(primary.id);
        }
        const sr = data?.ticket_number ?? '';
        if (sr && !name) {
          setName(`LM cabling — ${sr}`);
        }
      })
      .catch((err: any) => {
        Snackbar.show({
          text: err?.message || 'Could not load Last Mile form',
          backgroundColor: 'red',
          textColor: colors.white,
        });
        props.setModalVisible(false);
      })
      .finally(() => setLoading(false));
  }, [props.modalVisible, props.ticketId, auth?.token]);

  async function submitHandoff() {
    if (!addressId) {
      Snackbar.show({
        text: 'Select a site address',
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }
    if (!name.trim() || !description.trim()) {
      Snackbar.show({
        text: 'Name and description are required',
        backgroundColor: 'red',
        textColor: colors.white,
      });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        description: description.trim(),
        address_id: addressId,
        activity_date: moment(activityDate, 'YYYY-MM-DD').format('YYYY-MM-DD'),
      };
      if (notes.trim()) {
        body.notes = notes.trim();
      }

      const {data, response} = await apiFetch(
        `/tickets/${props.ticketId}/lm/handoff`,
        auth.token,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(
          Array.isArray(data?.message)
            ? data.message.join(', ')
            : data?.message || 'Handoff failed',
        );
      }

      Snackbar.show({
        text: 'Handed over to Transport Network (Last Mile)',
        backgroundColor: colors.primary,
        textColor: colors.white,
      });
      props.setModalVisible(false);
      props.onSuccess?.();
    } catch (error: any) {
      Snackbar.show({
        text: error?.message || 'Handoff failed',
        backgroundColor: 'red',
        textColor: colors.white,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={props.modalVisible} animationType="slide" transparent>
      <TouchableWithoutFeedback onPress={() => props.setModalVisible(false)}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheet}>
              <Text style={styles.title}>Hand over to Last Mile</Text>
              <Text style={styles.hint}>
                Creates a Last Mile Cabling activity for the Transport Network
                team (team pool — any LM tech can take it in CRM).
              </Text>

              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
                  <Text style={styles.label}>Activity name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                  />
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                  <Text style={styles.label}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                  <Text style={styles.label}>Visit date</Text>
                  <TextInput
                    style={styles.input}
                    value={activityDate}
                    onChangeText={setActivityDate}
                    placeholder="YYYY-MM-DD"
                  />

                  <Text style={styles.label}>Site address</Text>
                  {(ctx?.addresses ?? []).map((addr: any) => (
                    <TouchableOpacity
                      key={addr.id}
                      style={[
                        styles.option,
                        addressId === addr.id && styles.optionActive,
                      ]}
                      onPress={() => setAddressId(addr.id)}>
                      <Text style={styles.optionTitle}>
                        {addr.type ?? 'Address'}
                      </Text>
                      <Text style={styles.optionSub}>
                        {[addr.address_line_1, addr.town_city]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <ModalFooterActions
                onCancel={() => props.setModalVisible(false)}
                onSubmit={submitHandoff}
                submitText={submitting ? 'Submitting…' : 'Hand over'}
                loading={submitting}
                submitDisabled={loading}
              />
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default LmHandoffModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  scroll: {maxHeight: 420},
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  hint: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.primary,
  },
  multiline: {minHeight: 72, textAlignVertical: 'top'},
  option: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0F9FF',
  },
  optionTitle: {fontWeight: '600', color: colors.primary},
  optionSub: {fontSize: 12, color: '#64748B', marginTop: 2},
});
