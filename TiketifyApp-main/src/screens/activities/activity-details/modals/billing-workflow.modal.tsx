import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../../../constants/colors';
import {radius, spacing, typography} from '../../../../constants/styles';
import PrimaryButton from '../../../../components/ui/primary-button';
import SecondaryButton from '../../../../components/ui/secondary-button';
import {
  EmptyState,
  ErrorState,
  InlineBanner,
} from '../../../../components/ui/state-views';
import {apiGet, apiPatch, apiPost} from '../../../../utils/apiClient';
import {showError, showInfo, showSuccess} from '../../../../utils/notify';

type CatalogItem = {
  code: string;
  label: string;
  amount_mvr: string;
};

type Preview = {
  lines: Array<{
    code: string;
    label: string;
    quantity: number;
    line_total_mvr: string;
  }>;
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

const STEP_INDEX: Record<Step, number> = {
  decide: 0,
  items: 1,
  review: 2,
  await: 3,
};

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
  const [booting, setBooting] = React.useState(false);
  const [bootError, setBootError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = React.useState('');
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

  const applyWorkflow = React.useCallback((data: any) => {
    setWorkflow(data);
    if (
      data?.decision === 'CHARGEABLE' &&
      data?.next_step === 'await_customer_payment'
    ) {
      setStep('await');
    } else if (data?.decision === 'CHARGEABLE') {
      setStep('items');
    } else {
      setStep('decide');
    }
  }, []);

  const loadWorkflow = React.useCallback(async () => {
    applyWorkflow(await apiGet(`/billing/tickets/${ticketId}/workflow`, token));
  }, [applyWorkflow, ticketId, token]);

  const loadCatalog = React.useCallback(async () => {
    setCatalogError('');
    try {
      const data = await apiGet('/charges/catalog', token);
      if (Array.isArray(data?.items)) {
        setCatalog(data.items);
        if (data.gst_rate != null) {
          setGstRate(data.gst_rate);
        }
      } else if (Array.isArray(data)) {
        setCatalog(data);
      }
    } catch (err: any) {
      setCatalogError(err?.message || 'Could not load charge items');
    }
  }, [token]);

  const boot = React.useCallback(async () => {
    setBooting(true);
    setBootError('');
    setPreview(null);
    const [workflowResult, contextResult] = await Promise.allSettled([
      apiGet(`/billing/tickets/${ticketId}/workflow`, token),
      apiGet(`/billing/tickets/${ticketId}/context`, token),
      loadCatalog(),
    ]);
    if (workflowResult.status === 'fulfilled') {
      applyWorkflow(workflowResult.value);
    } else {
      setBootError(workflowResult.reason?.message || 'Could not load billing');
    }
    if (contextResult.status === 'fulfilled') {
      const ctx = contextResult.value ?? {};
      setDefaultPhone(ctx.default_payment_phone ?? '');
      setPhone(ctx.default_payment_phone ?? '');
      if (ctx.gst_rate != null) {
        setGstRate(ctx.gst_rate);
      }
      setSrNumber(ctx.sr_number ?? null);
      setCustomerName(ctx.customer_name ?? null);
    }
    setBooting(false);
  }, [applyWorkflow, loadCatalog, ticketId, token]);

  React.useEffect(() => {
    if (visible && token) {
      boot();
    }
  }, [visible, token, boot]);

  function buildItems() {
    return Object.keys(selected)
      .filter(code => selected[code])
      .map(code => ({code, quantity: Math.max(1, qty[code] ?? 1)}));
  }

  const phoneChanged =
    Boolean(defaultPhone) && phone.trim() !== defaultPhone.trim();

  function validatePhone(): boolean {
    if (!phone.trim()) {
      showError('Enter the customer mobile number for the payment link');
      return false;
    }
    if (phoneChanged && !phoneOverride) {
      showError('Confirm you want to use a different number');
      return false;
    }
    return true;
  }

  async function saveDecision(chargeable: boolean) {
    setLoading(true);
    try {
      await apiPatch(
        `/billing/tickets/${ticketId}/decision`,
        {chargeable},
        token,
      );
      if (chargeable) {
        setStep('items');
        showInfo('Select the charge items for this job');
      } else {
        showSuccess('Marked as no charge');
        onUpdated();
        onClose();
      }
    } catch (err: any) {
      showError(err?.message || 'Could not save the decision');
    } finally {
      setLoading(false);
    }
  }

  async function goToReview() {
    const items = buildItems();
    if (!items.length) {
      showError('Select at least one charge item');
      return;
    }
    if (!validatePhone()) {
      return;
    }
    setLoading(true);
    try {
      const data = await apiPost(
        `/billing/tickets/${ticketId}/preview`,
        {items},
        token,
      );
      setPreview(data);
      setStep('review');
    } catch (err: any) {
      showError(err?.message || 'Could not prepare the invoice');
    } finally {
      setLoading(false);
    }
  }

  async function sendToCustomer() {
    const items = buildItems();
    if (!items.length || !validatePhone()) {
      return;
    }
    setLoading(true);
    try {
      const data = await apiPost(
        `/payments/tickets/${ticketId}`,
        {
          items,
          payment_phone: phone.trim(),
          phone_override_confirmed: phoneChanged ? phoneOverride : false,
        },
        token,
        {timeoutMs: 45000},
      );
      showSuccess(
        data?.invoice_number
          ? `Payment link sent. Invoice ${data.invoice_number}`
          : 'Payment link sent to the customer',
      );
      setStep('await');
      await loadWorkflow().catch(() => {});
      onUpdated();
    } catch (err: any) {
      showError(err?.message || 'Could not send the payment link');
    } finally {
      setLoading(false);
    }
  }

  async function resendSms() {
    setLoading(true);
    try {
      await apiPost(
        `/payments/tickets/${ticketId}`,
        {
          resend_sms: true,
          payment_phone: phone.trim(),
          phone_override_confirmed: phoneOverride,
        },
        token,
      );
      showSuccess('Payment link resent');
    } catch (err: any) {
      showError(err?.message || 'Could not resend the link');
    } finally {
      setLoading(false);
    }
  }

  async function checkPayment() {
    setLoading(true);
    try {
      const ref = workflow?.pending_payment_reference;
      const data = await apiPost(
        ref
          ? `/payments/${ref}/reconcile`
          : `/billing/tickets/${ticketId}/check-payment`,
        {},
        token,
      );
      await loadWorkflow().catch(() => {});
      onUpdated();
      if (
        data?.payment_status === 'confirmed' ||
        data?.status === 'CONFIRMED'
      ) {
        showSuccess('Payment received. You can finish and close the ticket.');
      } else {
        showInfo('Still waiting for the customer to pay');
      }
    } catch (err: any) {
      showError(err?.message || 'Could not check the payment');
    } finally {
      setLoading(false);
    }
  }

  const activeIdx = STEP_INDEX[step];
  const rate = preview?.gst_rate ?? gstRate ?? 0;
  const selectedCount = buildItems().length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Charges & payment</Text>
            {srNumber ? (
              <Text style={styles.subtitle}>Ticket #{srNumber}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
            <Icon name="close" size={22} color={colors.black} />
          </TouchableOpacity>
        </View>

        <View style={styles.stepper}>
          {STEPS.map((s, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <View key={s.key} style={styles.stepItem}>
                {i < STEPS.length - 1 ? (
                  <View style={[styles.stepBar, done && styles.stepBarDone]} />
                ) : null}
                <View
                  style={[
                    styles.stepDot,
                    done && styles.stepDotDone,
                    active && styles.stepDotActive,
                  ]}>
                  {done ? (
                    <Icon name="checkmark" size={14} color={colors.white} />
                  ) : (
                    <Text
                      style={[
                        styles.stepDotText,
                        active && styles.stepDotTextOn,
                      ]}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.stepLabel, active && styles.stepLabelActive]}>
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>

        {booting ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>Loading billing…</Text>
          </View>
        ) : bootError ? (
          <ErrorState message={bootError} onRetry={boot} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled">
            {step === 'decide' && (
              <>
                <Text style={styles.lead}>
                  Only charge the customer if extra work or materials were
                  needed beyond the standard service.
                </Text>
                <PrimaryButton
                  text="Yes, charge the customer"
                  onPress={() => saveDecision(true)}
                  loading={loading}
                />
                <SecondaryButton
                  text="No charge, included in service"
                  onPress={() => saveDecision(false)}
                  disabled={loading}
                />
              </>
            )}

            {step === 'items' && (
              <>
                <Text style={styles.section}>Charge items</Text>
                {catalogError ? (
                  <ErrorState
                    message={catalogError}
                    onRetry={loadCatalog}
                    compact
                  />
                ) : catalog.length === 0 ? (
                  <EmptyState
                    compact
                    icon="pricetags-outline"
                    title="No charge items configured"
                    message="Ask an admin to add charges in the admin panel."
                  />
                ) : (
                  <View style={styles.card}>
                    {catalog.map((item, index) => {
                      const isOn = Boolean(selected[item.code]);
                      return (
                        <View
                          key={item.code}
                          style={[
                            styles.chargeRow,
                            index > 0 && styles.chargeRowBorder,
                          ]}>
                          <TouchableOpacity
                            style={styles.chargeMain}
                            onPress={() =>
                              setSelected(s => ({
                                ...s,
                                [item.code]: !s[item.code],
                              }))
                            }
                            accessibilityRole="checkbox"
                            accessibilityState={{checked: isOn}}>
                            <Icon
                              name={isOn ? 'checkbox' : 'square-outline'}
                              size={22}
                              color={isOn ? colors.primary : colors.gray3}
                            />
                            <View style={styles.flex}>
                              <Text style={styles.chargeLabel}>
                                {item.label}
                              </Text>
                              <Text style={styles.muted}>
                                {item.amount_mvr} MVR each
                              </Text>
                            </View>
                          </TouchableOpacity>
                          {isOn ? (
                            <View style={styles.qtyRow}>
                              <QtyButton
                                icon="remove"
                                onPress={() =>
                                  setQty(q => ({
                                    ...q,
                                    [item.code]: Math.max(
                                      1,
                                      (q[item.code] ?? 1) - 1,
                                    ),
                                  }))
                                }
                              />
                              <Text style={styles.qtyVal}>
                                {qty[item.code] ?? 1}
                              </Text>
                              <QtyButton
                                icon="add"
                                onPress={() =>
                                  setQty(q => ({
                                    ...q,
                                    [item.code]: (q[item.code] ?? 1) + 1,
                                  }))
                                }
                              />
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}

                <Text style={styles.section}>Customer mobile</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={value => {
                    setPhone(value);
                    setPhoneOverride(false);
                  }}
                  keyboardType="phone-pad"
                  placeholder="Mobile number for the pay link"
                  placeholderTextColor={colors.gray3}
                />
                {phoneChanged ? (
                  <TouchableOpacity
                    onPress={() => setPhoneOverride(o => !o)}
                    style={styles.overrideRow}
                    accessibilityRole="checkbox"
                    accessibilityState={{checked: phoneOverride}}>
                    <Icon
                      name={phoneOverride ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={phoneOverride ? colors.primary : colors.gray3}
                    />
                    <Text style={styles.overrideText}>
                      Send to this number instead of the CRM number (
                      {defaultPhone})
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <PrimaryButton
                  text={
                    selectedCount
                      ? `Review invoice (${selectedCount})`
                      : 'Review invoice'
                  }
                  onPress={goToReview}
                  loading={loading}
                  disabled={!selectedCount}
                />
              </>
            )}

            {step === 'review' && preview && (
              <>
                <TouchableOpacity
                  onPress={() => setStep('items')}
                  style={styles.backLink}>
                  <Icon name="chevron-back" size={16} color={colors.primary} />
                  <Text style={styles.backLinkText}>Edit items</Text>
                </TouchableOpacity>
                <View style={styles.invoiceCard}>
                  <View style={styles.invoiceHeader}>
                    <Text style={styles.invoiceBrand}>
                      Medianet · Ticketify
                    </Text>
                    <Text style={styles.invoiceTag}>Proforma</Text>
                  </View>
                  <MetaRow
                    label="Service request"
                    value={srNumber ?? ticketId}
                  />
                  {customerName ? (
                    <MetaRow label="Customer" value={customerName} />
                  ) : null}
                  <MetaRow
                    label="Date"
                    value={new Date().toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  />
                  <View style={styles.divider} />
                  {preview.lines.map(line => (
                    <View key={line.code} style={styles.lineRow}>
                      <View style={styles.flex}>
                        <Text style={styles.chargeLabel}>{line.label}</Text>
                        <Text style={styles.muted}>Qty {line.quantity}</Text>
                      </View>
                      <Text style={styles.lineAmt}>
                        {line.line_total_mvr} MVR
                      </Text>
                    </View>
                  ))}
                  <View style={styles.divider} />
                  <MetaRow
                    label="Subtotal"
                    value={`${preview.subtotal_mvr.toFixed(2)} MVR`}
                  />
                  <MetaRow
                    label={`GST (${(rate * 100).toFixed(0)}%)`}
                    value={`${preview.tax_mvr.toFixed(2)} MVR`}
                  />
                  <View style={styles.grandRow}>
                    <Text style={styles.grandLabel}>Total due</Text>
                    <Text style={styles.grandVal}>
                      {preview.total_mvr.toFixed(2)} MVR
                    </Text>
                  </View>
                </View>
                <InlineBanner
                  tone="info"
                  icon="chatbubble-ellipses-outline"
                  message={`An SMS with the itemised charges and a secure pay link goes to ${
                    phone.trim() || 'the customer'
                  }.`}
                />
                <PrimaryButton
                  text="Create invoice & send pay link"
                  onPress={sendToCustomer}
                  loading={loading}
                />
              </>
            )}

            {step === 'await' && (
              <View style={styles.awaitBox}>
                {workflow?.confirmed_receipt_number ? (
                  <InlineBanner
                    tone="info"
                    icon="checkmark-circle-outline"
                    message={`Paid. Receipt ${workflow.confirmed_receipt_number}`}
                  />
                ) : (
                  <>
                    <View style={styles.awaitIcon}>
                      <Icon
                        name="hourglass-outline"
                        size={28}
                        color={colors.warning}
                      />
                    </View>
                    <Text style={styles.awaitTitle}>Waiting for payment</Text>
                    {workflow?.open_invoice_number ? (
                      <Text style={styles.muted}>
                        Invoice {workflow.open_invoice_number}
                      </Text>
                    ) : null}
                    <Text style={styles.lead}>
                      The customer pays from the SMS link. Check the status once
                      they have paid, then finish the job.
                    </Text>
                    <PrimaryButton
                      text="Check payment status"
                      onPress={checkPayment}
                      loading={loading}
                    />
                    <SecondaryButton
                      text="Resend SMS link"
                      onPress={resendSms}
                      disabled={loading}
                    />
                  </>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function QtyButton({icon, onPress}: {icon: string; onPress: () => void}) {
  return (
    <TouchableOpacity
      style={styles.qtyBtn}
      onPress={onPress}
      accessibilityLabel={icon}>
      <Icon name={icon} size={18} color={colors.primary} />
    </TouchableOpacity>
  );
}

function MetaRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.surface},
  flex: {flex: 1},
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerText: {flex: 1},
  title: {...typography.h3},
  subtitle: {...typography.caption, marginTop: 2},
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  stepItem: {flex: 1, alignItems: 'center'},
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.bordergray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  stepDotActive: {borderColor: colors.primary, backgroundColor: colors.primary},
  stepDotDone: {borderColor: colors.success, backgroundColor: colors.success},
  stepDotText: {fontSize: 12, fontWeight: '700', color: colors.gray2},
  stepDotTextOn: {color: colors.white},
  stepLabel: {
    fontSize: 11,
    marginTop: 4,
    color: colors.gray2,
    textAlign: 'center',
  },
  stepLabelActive: {color: colors.primary, fontWeight: '700'},
  stepBar: {
    position: 'absolute',
    top: 13,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: colors.bordergray,
  },
  stepBarDone: {backgroundColor: colors.success},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  body: {padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md},
  lead: {fontSize: 14, color: colors.gray2, lineHeight: 20},
  section: {...typography.label, marginTop: spacing.sm},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
  },
  chargeRow: {paddingVertical: spacing.md},
  chargeRowBorder: {borderTopWidth: 1, borderTopColor: colors.borderLight},
  chargeMain: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  chargeLabel: {fontSize: 15, color: colors.black, fontWeight: '500'},
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginLeft: 34,
    gap: spacing.md,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyVal: {
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
    color: colors.black,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 16,
    color: colors.black,
  },
  overrideRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  overrideText: {flex: 1, fontSize: 13, color: colors.gray2},
  backLink: {flexDirection: 'row', alignItems: 'center', gap: 2},
  backLinkText: {color: colors.primary, fontSize: 14, fontWeight: '600'},
  invoiceCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  invoiceBrand: {fontSize: 16, fontWeight: '700', color: colors.black},
  invoiceTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: spacing.md,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.black,
    flexShrink: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  lineAmt: {fontSize: 14, fontWeight: '600', color: colors.black},
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  grandLabel: {fontSize: 16, fontWeight: '700', color: colors.black},
  grandVal: {fontSize: 16, fontWeight: '700', color: colors.primary},
  awaitBox: {gap: spacing.md, alignItems: 'stretch'},
  awaitIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awaitTitle: {...typography.h3, textAlign: 'center'},
  muted: {fontSize: 13, color: colors.gray2},
});
