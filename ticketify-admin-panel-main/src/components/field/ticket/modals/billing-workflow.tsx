"use client";

import {
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  Hourglass,
  Loader2,
  MessageSquareText,
  Minus,
  Plus,
  Square,
  Tags,
} from "lucide-react";
import React from "react";
import { PrimaryButton, SecondaryButton } from "@/components/field/ui/button";
import { EmptyState, ErrorState, InlineBanner } from "@/components/field/ui/state-views";
import WorkflowSheet, { SectionTitle, SheetBody, SheetCenter } from "@/components/field/ui/workflow-sheet";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showInfo, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

type CatalogItem = { code: string; label: string; amount_mvr: string };

type Preview = {
  lines: Array<{ code: string; label: string; quantity: number; line_total_mvr: string }>;
  subtotal_mvr: number;
  tax_mvr: number;
  total_mvr: number;
  gst_rate: number;
};

type Step = "items" | "review" | "await";

const STEPS: { key: Step; label: string }[] = [
  { key: "items", label: "Items" },
  { key: "review", label: "Invoice" },
  { key: "await", label: "Payment" },
];
const STEP_INDEX: Record<Step, number> = { items: 0, review: 1, await: 2 };

export default function BillingWorkflowModal({
  visible,
  onClose,
  ticketId,
  onUpdated,
}: {
  visible: boolean;
  onClose: () => void;
  ticketId: string;
  onUpdated: () => void;
}) {
  const { token } = useSession();
  const [step, setStep] = React.useState<Step>("items");
  const [booting, setBooting] = React.useState(false);
  const [bootError, setBootError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = React.useState("");
  const [gstRate, setGstRate] = React.useState<number | null>(null);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [phone, setPhone] = React.useState("");
  const [defaultPhone, setDefaultPhone] = React.useState("");
  const [phoneOverride, setPhoneOverride] = React.useState(false);
  const [workflow, setWorkflow] = React.useState<any>(null);
  const [srNumber, setSrNumber] = React.useState<string | null>(null);
  const [customerName, setCustomerName] = React.useState<string | null>(null);

  const applyWorkflow = React.useCallback((data: any) => {
    setWorkflow(data);
    setStep(data?.payment_status === "pending" || data?.payment_status === "confirmed" ? "await" : "items");
  }, []);

  const loadWorkflow = React.useCallback(async () => {
    applyWorkflow(await apiGet(`/billing/tickets/${ticketId}/workflow`, token));
  }, [applyWorkflow, ticketId, token]);

  const loadCatalog = React.useCallback(async () => {
    setCatalogError("");
    try {
      const data = await apiGet("/charges/catalog", token);
      if (Array.isArray(data?.items)) {
        setCatalog(data.items);
        if (data.gst_rate != null) {
          setGstRate(data.gst_rate);
        }
      } else if (Array.isArray(data)) {
        setCatalog(data);
      }
    } catch (err: any) {
      setCatalogError(err?.message || "Could not load charge items");
    }
  }, [token]);

  const boot = React.useCallback(async () => {
    setBooting(true);
    setBootError("");
    setPreview(null);
    const [workflowResult, contextResult] = await Promise.allSettled([
      apiGet(`/billing/tickets/${ticketId}/workflow`, token),
      apiGet(`/billing/tickets/${ticketId}/context`, token),
      loadCatalog(),
    ]);
    if (workflowResult.status === "fulfilled") {
      applyWorkflow(workflowResult.value);
    } else {
      setBootError(workflowResult.reason?.message || "Could not load billing");
    }
    if (contextResult.status === "fulfilled") {
      const ctx = contextResult.value ?? {};
      setDefaultPhone(ctx.default_payment_phone ?? "");
      setPhone(ctx.default_payment_phone ?? "");
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

  const isPaid = workflow?.payment_status === "confirmed";
  const awaitingPayment = visible && step === "await" && !isPaid;
  const onUpdatedRef = React.useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  React.useEffect(() => {
    if (!awaitingPayment || !token) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await apiPost(`/billing/tickets/${ticketId}/check-payment`, {}, token, {
          silent: true,
          timeoutMs: 20000,
        });
        if (cancelled || !data) {
          return;
        }
        applyWorkflow(data);
        if (data.payment_status === "confirmed") {
          showSuccess("Payment received. You can finish and close the ticket.");
          onUpdatedRef.current();
        }
      } catch {
        // Silent background check; the manual button surfaces errors.
      }
    };
    const id = window.setInterval(poll, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [awaitingPayment, applyWorkflow, ticketId, token]);

  function buildItems() {
    return Object.keys(selected)
      .filter((code) => selected[code])
      .map((code) => ({ code, quantity: Math.max(1, qty[code] ?? 1) }));
  }

  const phoneChanged = Boolean(defaultPhone) && phone.trim() !== defaultPhone.trim();

  function validatePhone(): boolean {
    if (!phone.trim()) {
      showError("Enter the customer mobile number for the payment link");
      return false;
    }
    if (phoneChanged && !phoneOverride) {
      showError("Confirm you want to use a different number");
      return false;
    }
    return true;
  }

  async function goToReview() {
    const items = buildItems();
    if (!items.length) {
      showError("Select at least one charge item");
      return;
    }
    if (!validatePhone()) {
      return;
    }
    setLoading(true);
    try {
      setPreview(await apiPost(`/billing/tickets/${ticketId}/preview`, { items }, token));
      setStep("review");
    } catch (err: any) {
      showError(err?.message || "Could not prepare the invoice");
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
        { items, payment_phone: phone.trim(), phone_override_confirmed: phoneChanged ? phoneOverride : false },
        token,
        { timeoutMs: 45000 },
      );
      showSuccess(
        data?.invoice_number ? `Payment link sent. Invoice ${data.invoice_number}` : "Payment link sent to the customer",
      );
      setStep("await");
      await loadWorkflow().catch(() => {});
      onUpdated();
    } catch (err: any) {
      showError(err?.message || "Could not send the payment link");
    } finally {
      setLoading(false);
    }
  }

  async function resendSms() {
    setLoading(true);
    try {
      await apiPost(
        `/payments/tickets/${ticketId}`,
        { resend_sms: true, payment_phone: phone.trim(), phone_override_confirmed: phoneOverride },
        token,
      );
      showSuccess("Payment link resent");
    } catch (err: any) {
      showError(err?.message || "Could not resend the link");
    } finally {
      setLoading(false);
    }
  }

  async function checkPayment() {
    setLoading(true);
    try {
      const ref = workflow?.pending_payment_reference;
      const data = await apiPost(
        ref ? `/payments/${ref}/reconcile` : `/billing/tickets/${ticketId}/check-payment`,
        {},
        token,
      );
      await loadWorkflow().catch(() => {});
      onUpdated();
      if (data?.payment_status === "confirmed" || data?.status === "CONFIRMED") {
        showSuccess("Payment received. You can finish and close the ticket.");
      } else {
        showInfo("Still waiting for the customer to pay");
      }
    } catch (err: any) {
      showError(err?.message || "Could not check the payment");
    } finally {
      setLoading(false);
    }
  }

  const activeIdx = STEP_INDEX[step];
  const rate = preview?.gst_rate ?? gstRate ?? 0;
  const selectedCount = buildItems().length;

  return (
    <WorkflowSheet
      visible={visible}
      onClose={onClose}
      title="Charges & payment"
      subtitle={srNumber ? `Ticket #${srNumber}` : null}
    >
      <div className="flex border-b border-borderlight bg-white px-3 py-3">
        {STEPS.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={s.key} className="relative flex flex-1 flex-col items-center">
              {i < STEPS.length - 1 ? (
                <div className={cn("absolute left-1/2 top-[13px] h-0.5 w-full", done ? "bg-success" : "bg-bordergray")} />
              ) : null}
              <div
                className={cn(
                  "relative flex h-7 w-7 items-center justify-center rounded-full border-2",
                  done ? "border-success bg-success" : active ? "border-primary bg-primary" : "border-bordergray bg-white",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5 text-white" />
                ) : (
                  <span className={cn("text-xs font-bold", active ? "text-white" : "text-gray2")}>{i + 1}</span>
                )}
              </div>
              <span className={cn("mt-1 text-[11px]", active ? "font-bold text-primary" : "text-gray2")}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {booting ? (
        <SheetCenter>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-[13px] text-gray2">Loading billing…</p>
        </SheetCenter>
      ) : bootError ? (
        <ErrorState message={bootError} onRetry={boot} />
      ) : (
        <SheetBody>
          {step === "items" && (
            <>
              <SectionTitle>Charge items</SectionTitle>
              {catalogError ? (
                <ErrorState message={catalogError} onRetry={loadCatalog} compact />
              ) : catalog.length === 0 ? (
                <EmptyState
                  compact
                  icon={Tags}
                  title="No charge items configured"
                  message="Ask an admin to add charges in the admin panel."
                />
              ) : (
                <div className="rounded-lg border border-borderlight bg-white px-3">
                  {catalog.map((item, index) => {
                    const isOn = Boolean(selected[item.code]);
                    return (
                      <div key={item.code} className={cn("py-3", index > 0 && "border-t border-borderlight")}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isOn}
                          onClick={() => setSelected((s) => ({ ...s, [item.code]: !s[item.code] }))}
                          className="flex w-full items-center gap-3 text-left"
                        >
                          {isOn ? (
                            <CheckSquare className="h-[22px] w-[22px] text-primary" />
                          ) : (
                            <Square className="h-[22px] w-[22px] text-gray3" />
                          )}
                          <span className="flex-1">
                            <span className="block text-[15px] font-medium text-ink">{item.label}</span>
                            <span className="block text-[13px] text-gray2">{item.amount_mvr} MVR each</span>
                          </span>
                        </button>
                        {isOn ? (
                          <div className="ml-[34px] mt-2 flex items-center gap-3">
                            <QtyButton
                              label="Decrease"
                              icon={<Minus className="h-[18px] w-[18px]" />}
                              onClick={() => setQty((q) => ({ ...q, [item.code]: Math.max(1, (q[item.code] ?? 1) - 1) }))}
                            />
                            <span className="min-w-6 text-center text-base font-semibold text-ink">{qty[item.code] ?? 1}</span>
                            <QtyButton
                              label="Increase"
                              icon={<Plus className="h-[18px] w-[18px]" />}
                              onClick={() => setQty((q) => ({ ...q, [item.code]: (q[item.code] ?? 1) + 1 }))}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <SectionTitle>Customer mobile</SectionTitle>
              <input
                className="input text-base"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneOverride(false);
                }}
                placeholder="Mobile number for the pay link"
              />
              {phoneChanged ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={phoneOverride}
                  onClick={() => setPhoneOverride((o) => !o)}
                  className="flex items-center gap-2 text-left"
                >
                  {phoneOverride ? (
                    <CheckSquare className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Square className="h-5 w-5 shrink-0 text-gray3" />
                  )}
                  <span className="flex-1 text-[13px] text-gray2">
                    Send to this number instead of the CRM number ({defaultPhone})
                  </span>
                </button>
              ) : null}

              <PrimaryButton
                text={selectedCount ? `Review invoice (${selectedCount})` : "Review invoice"}
                onClick={goToReview}
                loading={loading}
                disabled={!selectedCount}
              />
            </>
          )}

          {step === "review" && preview && (
            <>
              <button
                type="button"
                onClick={() => setStep("items")}
                className="flex items-center gap-0.5 self-start text-sm font-semibold text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
                Edit items
              </button>
              <div className="rounded-lg border border-borderlight bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-base font-bold text-ink">Medianet · Ticketify</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-primary">Proforma</span>
                </div>
                <MetaRow label="Service request" value={srNumber ?? ticketId} />
                {customerName ? <MetaRow label="Customer" value={customerName} /> : null}
                <MetaRow
                  label="Date"
                  value={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                />
                <div className="my-3 h-px bg-borderlight" />
                {preview.lines.map((line) => (
                  <div key={line.code} className="mb-2 flex items-start">
                    <div className="flex-1">
                      <p className="text-[15px] font-medium text-ink">{line.label}</p>
                      <p className="text-[13px] text-gray2">Qty {line.quantity}</p>
                    </div>
                    <span className="text-sm font-semibold text-ink">{line.line_total_mvr} MVR</span>
                  </div>
                ))}
                <div className="my-3 h-px bg-borderlight" />
                <MetaRow label="Subtotal" value={`${preview.subtotal_mvr.toFixed(2)} MVR`} />
                <MetaRow label={`GST (${(rate * 100).toFixed(0)}%)`} value={`${preview.tax_mvr.toFixed(2)} MVR`} />
                <div className="mt-2 flex justify-between">
                  <span className="text-base font-bold text-ink">Total due</span>
                  <span className="text-base font-bold text-primary">{preview.total_mvr.toFixed(2)} MVR</span>
                </div>
              </div>
              <InlineBanner
                tone="info"
                icon={MessageSquareText}
                message={`An SMS with the itemised charges and a secure pay link goes to ${phone.trim() || "the customer"}.`}
              />
              <PrimaryButton text="Create invoice & send pay link" onClick={sendToCustomer} loading={loading} />
            </>
          )}

          {step === "await" && (
            <div className="flex flex-col gap-3">
              {isPaid ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center self-center rounded-full bg-success-bg">
                    <CheckCircle2 className="h-[30px] w-[30px] text-success" />
                  </div>
                  <h3 className="text-center text-lg font-semibold text-ink">Payment received</h3>
                  {workflow?.confirmed_receipt_number ? (
                    <p className="text-center text-[13px] text-gray2">Receipt {workflow.confirmed_receipt_number}</p>
                  ) : null}
                  <p className="text-sm leading-5 text-gray2">
                    Confirmed by Bank of Maldives. Finish the work and close the ticket.
                  </p>
                  <PrimaryButton text="Done" onClick={onClose} />
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center self-center rounded-full bg-warning-bg">
                    <Hourglass className="h-7 w-7 text-warning" />
                  </div>
                  <h3 className="text-center text-lg font-semibold text-ink">Waiting for payment</h3>
                  {workflow?.open_invoice_number ? (
                    <p className="text-center text-[13px] text-gray2">Invoice {workflow.open_invoice_number}</p>
                  ) : null}
                  <p className="text-sm leading-5 text-gray2">
                    The customer pays from the SMS link. This screen updates automatically once the bank confirms the
                    payment.
                  </p>
                  <PrimaryButton text="Check payment status" onClick={checkPayment} loading={loading} />
                  <SecondaryButton text="Resend SMS link" onClick={resendSms} disabled={loading} />
                </>
              )}
            </div>
          )}
        </SheetBody>
      )}
    </WorkflowSheet>
  );
}

function QtyButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-tertiary text-primary"
    >
      {icon}
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1 flex justify-between gap-3">
      <span className="text-[13px] text-gray2">{label}</span>
      <span className="shrink text-right text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}
