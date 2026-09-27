import React from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type Preview = {
  lines: Array<{code: string; label: string; quantity: number; line_total_mvr: string}>;
  subtotal_mvr: number;
  tax_mvr: number;
  total_mvr: number;
  gst_rate: number;
};

type Step = 'decide' | 'items' | 'review' | 'await';

const STEPS: {key: Step; label: string}[] = [
  {key: 'decide', label: 'Charge?'},
  {key: 'items', label: 'Items'},
  {key: 'review', label: 'Invoice'},
  {key: 'await', label: 'Payment'},
];

function parseError(data: any, fallback: string) {
  const msg = data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string') return msg;
  if (data?.error && typeof data.error === 'string') return data.error;
  return fallback;
}

function stepIndex(step: Step): number {
  if (step === 'decide') return 0;
  if (step === 'items') return 1;
  if (step === 'review') return 2;
  return 3;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  ticketId: string;
  token: string;
  onUpdated: () => void;
};

export default function BillingWorkflowModal({
  visible,
  onClose,
  ticketId,
  token,
  onUpdated,
}: Props) {
  const [step, setStep] = React.useState<Step>('decide');
  const [loading, setLoading] = React.useState(false);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [gstRate, setGstRate] = React.useState<number | null>(null);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [phone, setPhone] = React.useState('');
  const [defaultPhone, setDefaultPhone] = React.useState('');
  const [phoneOverride, setPhoneOverride] = React.useState(false);
  const [workflow, setWorkflow] = React.useState<any>(null);
  const [srNumber, setSrNumber] = React.useState<string | null>(null);
  const [customerName, setCustomerName] = React.useState<string | null>(null);

  const loadWorkflow = React.useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/billing/tickets/${ticketId}/workflow`, {
      headers: {Authorization: 'Bearer ' + token},
    });
    const data = await res.json();
    if (res.ok) {
      setWorkflow(data);
      if (data.decision === 'CHARGEABLE' && data.next_step === 'await_customer_payment') {
        setStep('await');
      } else if (data.decision === 'CHARGEABLE') {
        setStep('items');
      } else {
        setStep('decide');
      }
    }
  }, [ticketId, token]);

  React.useEffect(() => {
    if (!visible || !token) return;
    setPreview(null);
    loadWorkflow();
    fetch(`${API_BASE_URL}/billing/tickets/${ticketId}/context`, {
      headers: {Authorization: 'Bearer ' + token},
    })
      .then(r => r.json())
      .then(ctx => {
        setDefaultPhone(ctx.default_payment_phone ?? '');
        setPhone(ctx.default_payment_phone ?? '');
        setGstRate(ctx.gst_rate ?? null);
        setSrNumber(ctx.sr_number ?? null);
        setCustomerName(ctx.customer_name ?? null);
      })
      .catch(() => {});
    fetch(`${API_BASE_URL}/charges/catalog`, {
      headers: {Authorization: 'Bearer ' + token},
    })
      .then(r => r.json())
      .then(data => {
        if (data?.items) {
          setCatalog(data.items);
          setGstRate(data.gst_rate);
        } else if (Array.isArray(data)) {
          setCatalog(data);
        }
      })
      .catch(() => {});
  }, [visible, token, ticketId, loadWorkflow]);

  function buildItems() {
    return Object.keys(selected)
      .filter(c => selected[c])
      .map(code => ({code, quantity: Math.max(1, qty[code] ?? 1)}));
  }

  async function saveDecision(chargeable: boolean) {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/billing/tickets/${ticketId}/decision`,
        {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({chargeable}),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(data, 'Failed'));
      if (chargeable) {
        setStep('items');
        Snackbar.show({
          text: 'Select charge items — customer will receive SMS with pay link',
          backgroundColor: colors.primary,
        });
      } else {
        Snackbar.show({
          text: 'No charge — finish work and close ticket',
          backgroundColor: 'green',
        });
        onUpdated();
        onClose();
      }
    } catch (e: any) {
      Snackbar.show({text: e.message, backgroundColor: colors.primary});
    } finally {
      setLoading(false);
    }
  }

  async function runPreview(): Promise<Preview | null> {
    const items = buildItems();
    if (!items.length) {
      Snackbar.show({text: 'Select at least one item', backgroundColor: colors.primary});
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/billing/tickets/${ticketId}/preview`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({items}),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(data, 'Preview failed'));
      setPreview(data);
      return data;
    } catch (e: any) {
      Snackbar.show({text: e.message, backgroundColor: colors.primary});
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function goToReview() {
    if (!phone.trim()) {
      Snackbar.show({text: 'Payment mobile number required', backgroundColor: colors.primary});
      return;
    }
    const override =
      defaultPhone && phone.trim() !== defaultPhone.trim() ? phoneOverride : false;
    if (defaultPhone && phone.trim() !== defaultPhone.trim() && !phoneOverride) {
      Snackbar.show({
        text: 'Confirm different number before continuing',
        backgroundColor: colors.primary,
      });
      return;
    }
    void override;
    const p = await runPreview();
    if (p) setStep('review');
  }

  async function sendToCustomer() {
    const items = buildItems();
    if (!items.length) {
      Snackbar.show({text: 'Select at least one item', backgroundColor: colors.primary});
      return;
    }
    if (!phone.trim()) {
      Snackbar.show({text: 'Payment mobile number required', backgroundColor: colors.primary});
      return;
    }
    const override =
      defaultPhone && phone.trim() !== defaultPhone.trim() ? phoneOverride : false;
    if (defaultPhone && phone.trim() !== defaultPhone.trim() && !phoneOverride) {
      Snackbar.show({
        text: 'Confirm different number before sending',
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
        body: JSON.stringify({
          items,
          payment_phone: phone.trim(),
          phone_override_confirmed: override,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(data, 'Payment failed'));
      const mode = data.gateway_mode === 'bml' ? 'BML' : 'pay link';
      let text = `SMS sent (${mode}). Invoice ${data.invoice_number}`;
      if (data.link_hint) {
        text += ` — ${data.link_hint}`;
      } else if (data.customer_link_reachable_from_mobile === false) {
        text +=
          ' — link is localhost; use ngrok or BML for customer phones.';
      }
      Snackbar.show({
        text,
        backgroundColor: 'green',
        duration: Snackbar.LENGTH_LONG,
      });
      setStep('await');
      await loadWorkflow();
      onUpdated();
    } catch (e: any) {
      Snackbar.show({text: e.message, backgroundColor: colors.primary});
    } finally {
      setLoading(false);
    }
  }

  async function resendSms() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/payments/tickets/${ticketId}`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resend_sms: true,
          payment_phone: phone.trim(),
          phone_override_confirmed: phoneOverride,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(data, 'Resend failed'));
      Snackbar.show({text: 'Payment link resent by SMS', backgroundColor: 'green'});
    } catch (e: any) {
      Snackbar.show({text: e.message, backgroundColor: colors.primary});
    } finally {
      setLoading(false);
    }
  }

  async function checkPayment() {
    setLoading(true);
    try {
      const ref = workflow?.pending_payment_reference;
      const url = ref
        ? `${API_BASE_URL}/payments/${ref}/reconcile`
        : `${API_BASE_URL}/billing/tickets/${ticketId}/check-payment`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(data, 'Check failed'));
      await loadWorkflow();
      onUpdated();
      if (data.payment_status === 'confirmed' || data.status === 'CONFIRMED') {
        Snackbar.show({
          text: 'Payment confirmed — complete work, then close ticket',
          backgroundColor: 'green',
        });
      } else {
        Snackbar.show({text: 'Still awaiting payment', backgroundColor: colors.primary});
      }
    } catch (e: any) {
      Snackbar.show({text: e.message, backgroundColor: colors.primary});
    } finally {
      setLoading(false);
    }
  }

  const activeIdx = stepIndex(step);
  const rate = preview?.gst_rate ?? gstRate ?? 0;

  function InvoiceCard() {
    if (!preview) return null;
    const today = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return (
      <View style={styles.invoiceCard}>
        <View style={styles.invoiceHeader}>
          <Text style={styles.invoiceBrand}>Medianet · Ticketify</Text>
          <Text style={styles.invoiceTag}>Proforma invoice</Text>
        </View>
        <View style={styles.invoiceMetaRow}>
          <Text style={styles.invoiceMetaLabel}>Service request</Text>
          <Text style={styles.invoiceMetaValue}>{srNumber ?? ticketId}</Text>
        </View>
        {customerName ? (
          <View style={styles.invoiceMetaRow}>
            <Text style={styles.invoiceMetaLabel}>Customer</Text>
            <Text style={styles.invoiceMetaValue}>{customerName}</Text>
          </View>
        ) : null}
        <View style={styles.invoiceMetaRow}>
          <Text style={styles.invoiceMetaLabel}>Date</Text>
          <Text style={styles.invoiceMetaValue}>{today}</Text>
        </View>
        <View style={styles.invoiceDivider} />
        {preview.lines.map(l => (
          <View key={l.code} style={styles.invoiceLineRow}>
            <View style={{flex: 1}}>
              <Text style={styles.invoiceLineLabel}>{l.label}</Text>
              <Text style={styles.invoiceLineQty}>Qty {l.quantity}</Text>
            </View>
            <Text style={styles.invoiceLineAmt}>{l.line_total_mvr} MVR</Text>
          </View>
        ))}
        <View style={styles.invoiceDivider} />
        <View style={styles.invoiceTotalRow}>
          <Text style={styles.invoiceSub}>Subtotal</Text>
          <Text style={styles.invoiceSubVal}>{preview.subtotal_mvr.toFixed(2)} MVR</Text>
        </View>
        <View style={styles.invoiceTotalRow}>
          <Text style={styles.invoiceSub}>
            Tax ({(rate * 100).toFixed(0)}%)
          </Text>
          <Text style={styles.invoiceSubVal}>{preview.tax_mvr.toFixed(2)} MVR</Text>
        </View>
        <View style={[styles.invoiceTotalRow, styles.invoiceGrandRow]}>
          <Text style={styles.invoiceGrandLabel}>Total due</Text>
          <Text style={styles.invoiceGrandVal}>{preview.total_mvr.toFixed(2)} MVR</Text>
        </View>
        <Text style={styles.invoiceFoot}>
          SMS will be sent to {phone.trim() || '—'} with itemised charges and secure pay link.
        </Text>
      </View>
    );
  }

  function Stepper() {
    return (
      <View style={styles.stepper}>
        {STEPS.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <View key={s.key} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}>
                <Text
                  style={[
                    styles.stepDotText,
                    (done || active) && styles.stepDotTextOn,
                  ]}>
                  {done ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>
                {s.label}
              </Text>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepBar, done && styles.stepBarDone]} />
              )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Charges & payment</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <Stepper />

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {step === 'decide' && (
              <>
                <Text style={styles.lead}>
                  Optional — only if extra work or materials apply (spec §11).
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  disabled={loading}
                  onPress={() => saveDecision(true)}>
                  <Text style={styles.primaryBtnText}>Yes — charge required</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  disabled={loading}
                  onPress={() => saveDecision(false)}>
                  <Text style={styles.secondaryBtnText}>No — included in service</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'items' && (
              <>
                <Text style={styles.section}>Predefined charges (MVR)</Text>
                {catalog.map(item => (
                  <View key={item.code} style={styles.chargeRow}>
                    <TouchableOpacity
                      style={styles.chargeMain}
                      onPress={() =>
                        setSelected(s => ({...s, [item.code]: !s[item.code]}))
                      }>
                      <Text style={styles.check}>{selected[item.code] ? '✓' : '○'}</Text>
                      <View style={{flex: 1}}>
                        <Text style={styles.chargeLabel}>{item.label}</Text>
                        <Text style={styles.chargeUnit}>{item.amount_mvr} MVR each</Text>
                      </View>
                    </TouchableOpacity>
                    {selected[item.code] && (
                      <View style={styles.qtyRow}>
                        <TouchableOpacity
                          onPress={() =>
                            setQty(q => ({
                              ...q,
                              [item.code]: Math.max(1, (q[item.code] ?? 1) - 1),
                            }))
                          }>
                          <Text style={styles.qtyBtn}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyVal}>{qty[item.code] ?? 1}</Text>
                        <TouchableOpacity
                          onPress={() =>
                            setQty(q => ({
                              ...q,
                              [item.code]: (q[item.code] ?? 1) + 1,
                            }))
                          }>
                          <Text style={styles.qtyBtn}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}

                <Text style={styles.section}>Customer payment mobile</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="From CRM"
                  placeholderTextColor="#999"
                />
                {defaultPhone && phone.trim() !== defaultPhone.trim() && (
                  <TouchableOpacity
                    onPress={() => setPhoneOverride(o => !o)}
                    style={styles.overrideRow}>
                    <Text style={styles.check}>{phoneOverride ? '✓' : '○'}</Text>
                    <Text style={styles.overrideText}>
                      I confirm sending link to this number (not CRM default)
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.primaryBtn} onPress={goToReview} disabled={loading}>
                  <Text style={styles.primaryBtnText}>Continue to invoice review</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'review' && (
              <>
                <TouchableOpacity onPress={() => setStep('items')}>
                  <Text style={styles.backLink}>← Edit items</Text>
                </TouchableOpacity>
                <InvoiceCard />
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={sendToCustomer}
                  disabled={loading || !preview}>
                  <Text style={styles.primaryBtnText}>
                    Create invoice & SMS pay link to customer
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'await' && (
              <View style={styles.awaitBox}>
                <Text style={styles.awaitTitle}>Awaiting payment</Text>
                {workflow?.open_invoice_number && (
                  <Text style={styles.muted}>Invoice {workflow.open_invoice_number}</Text>
                )}
                {workflow?.confirmed_receipt_number ? (
                  <Text style={styles.paid}>
                    Paid — receipt {workflow.confirmed_receipt_number}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.muted}>
                      Customer pays via the SMS link. Then check status and complete remaining
                      work.
                    </Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={checkPayment} disabled={loading}>
                      <Text style={styles.primaryBtnText}>Check payment status</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.outlineBtn} onPress={resendSms} disabled={loading}>
                      <Text style={styles.outlineBtnText}>Resend SMS link</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {loading && <ActivityIndicator style={{marginTop: 16}} color={colors.primary} />}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.white},
  container: {flex: 1, backgroundColor: colors.white},
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {fontSize: 20, fontWeight: '700', color: colors.black},
  close: {color: colors.primary, fontSize: 16, fontWeight: '600'},
  stepper: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    justifyContent: 'space-between',
  },
  stepItem: {flex: 1, alignItems: 'center', position: 'relative'},
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    zIndex: 1,
  },
  stepDotActive: {borderColor: colors.primary, backgroundColor: colors.primary},
  stepDotDone: {borderColor: '#2e7d32', backgroundColor: '#2e7d32'},
  stepDotText: {fontSize: 12, fontWeight: '700', color: '#888'},
  stepDotTextOn: {color: colors.white},
  stepLabel: {fontSize: 10, marginTop: 4, color: '#999', textAlign: 'center'},
  stepLabelActive: {color: colors.primary, fontWeight: '600'},
  stepBar: {
    position: 'absolute',
    top: 14,
    left: '55%',
    width: '90%',
    height: 2,
    backgroundColor: '#e0e0e0',
    zIndex: 0,
  },
  stepBarDone: {backgroundColor: '#a5d6a7'},
  body: {padding: 20, paddingBottom: 40, gap: 12},
  lead: {fontSize: 14, color: colors.gray, marginBottom: 8, lineHeight: 20},
  section: {fontSize: 16, fontWeight: '600', marginTop: 8, color: colors.black},
  chargeRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 10,
  },
  chargeMain: {flexDirection: 'row', alignItems: 'center', gap: 10},
  check: {fontSize: 18, width: 24, color: colors.primary},
  chargeLabel: {fontSize: 15, color: colors.black},
  chargeUnit: {fontSize: 13, color: colors.gray},
  qtyRow: {flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 34, gap: 16},
  qtyBtn: {fontSize: 22, color: colors.primary, paddingHorizontal: 8},
  qtyVal: {fontSize: 16, minWidth: 24, textAlign: 'center'},
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.black,
  },
  overrideRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  overrideText: {flex: 1, fontSize: 13, color: colors.gray},
  backLink: {color: colors.primary, fontSize: 15, marginBottom: 4},
  invoiceCard: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceBrand: {fontSize: 16, fontWeight: '700', color: colors.black},
  invoiceTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  invoiceMetaRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
  invoiceMetaLabel: {fontSize: 12, color: colors.gray},
  invoiceMetaValue: {fontSize: 12, fontWeight: '500', color: colors.black},
  invoiceDivider: {height: 1, backgroundColor: '#e0e0e0', marginVertical: 10},
  invoiceLineRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8},
  invoiceLineLabel: {fontSize: 14, color: colors.black},
  invoiceLineQty: {fontSize: 12, color: colors.gray, marginTop: 2},
  invoiceLineAmt: {fontSize: 14, fontWeight: '600', color: colors.black},
  invoiceTotalRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
  invoiceSub: {fontSize: 13, color: colors.gray},
  invoiceSubVal: {fontSize: 13, color: colors.black},
  invoiceGrandRow: {marginTop: 6},
  invoiceGrandLabel: {fontSize: 16, fontWeight: '700', color: colors.black},
  invoiceGrandVal: {fontSize: 16, fontWeight: '700', color: colors.primary},
  invoiceFoot: {fontSize: 12, color: colors.gray, marginTop: 12, lineHeight: 18},
  primaryBtn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {color: colors.white, fontWeight: '600', textAlign: 'center'},
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {color: colors.primary, fontWeight: '600'},
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  outlineBtnText: {color: colors.black, fontWeight: '500'},
  awaitBox: {gap: 12},
  awaitTitle: {fontSize: 18, fontWeight: '600'},
  muted: {fontSize: 14, color: colors.gray, lineHeight: 20},
  paid: {fontSize: 15, color: 'green', fontWeight: '600'},
});
