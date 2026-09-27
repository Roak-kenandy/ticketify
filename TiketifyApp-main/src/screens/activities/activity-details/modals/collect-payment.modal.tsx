import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Snackbar from 'react-native-snackbar';
import colors from '../../../../constants/colors';
import {API_BASE_URL} from '../../../../config/api';

type CatalogItem = {
  code: string;
  label: string;
  amount_mvr: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  ticketId: string;
  token: string;
};

export default function CollectPaymentModal({
  visible,
  onClose,
  ticketId,
  token,
}: Props) {
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!visible || !token) return;
    fetch(`${API_BASE_URL}/charges/catalog`, {
      headers: {Authorization: 'Bearer ' + token},
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCatalog(data);
      })
      .catch(() => {});
  }, [visible, token]);

  const selectedCodes = Object.keys(selected).filter(k => selected[k]);
  const total = catalog
    .filter(c => selected[c.code])
    .reduce((s, c) => s + Number(c.amount_mvr), 0);

  async function startPayment() {
    if (selectedCodes.length === 0) {
      Snackbar.show({
        text: 'Select at least one charge',
        backgroundColor: colors.primary,
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/payments/tickets/${ticketId}`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({charge_codes: selectedCodes}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Payment failed');
      }
      const url = data.payment_url;
      if (url) {
        await Linking.openURL(url);
        Snackbar.show({
          text: `Invoice ${data.invoice_number} — open BML to pay`,
          backgroundColor: 'green',
          duration: Snackbar.LENGTH_LONG,
        });
        onClose();
      } else {
        Snackbar.show({
          text: 'Payment created but no URL returned',
          backgroundColor: colors.primary,
        });
      }
    } catch (e: any) {
      Snackbar.show({
        text: e?.message || 'Could not start payment',
        backgroundColor: colors.primary,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Collect payment</Text>
          <Text style={styles.sub}>
            Invoice & receipt are issued by Ticketify (not CRM).
          </Text>
          <ScrollView style={{maxHeight: 280}}>
            {catalog.map(item => (
              <TouchableOpacity
                key={item.code}
                style={styles.row}
                onPress={() =>
                  setSelected(s => ({...s, [item.code]: !s[item.code]}))
                }>
                <Text style={styles.check}>{selected[item.code] ? '☑' : '☐'}</Text>
                <View style={{flex: 1}}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text style={styles.amount}>{item.amount_mvr} MVR</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.total}>Subtotal (excl. GST in total): ~{total.toFixed(2)} MVR</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <TouchableOpacity style={styles.payBtn} onPress={startPayment}>
              <Text style={styles.payText}>Pay via BML</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {fontSize: 18, fontWeight: '600', color: colors.black},
  sub: {fontSize: 12, color: colors.gray},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8},
  check: {fontSize: 18, marginRight: 10},
  label: {fontSize: 15, color: colors.black},
  amount: {fontSize: 13, color: colors.gray},
  total: {fontWeight: '600'},
  payBtn: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  payText: {color: colors.white, fontWeight: '600'},
  cancel: {textAlign: 'center', color: colors.primary, padding: 8},
});
