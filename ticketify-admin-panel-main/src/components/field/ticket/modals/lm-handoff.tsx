"use client";

import { Circle, CircleDot, MapPin } from "lucide-react";
import moment from "moment";
import React from "react";
import { DateChips } from "@/components/field/ui/date-time-chips";
import FormModal from "@/components/field/ui/form-modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/field/ui/state-views";
import { Switch } from "@/components/field/ui/switch";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

const RESOLUTION_DAYS = [3, 5, 7, 10, 14];

export default function LmHandoffModal({
  ticketId,
  visible,
  onClose,
  onSuccess,
}: {
  ticketId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { token } = useSession();
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [ctx, setCtx] = React.useState<any>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [activityDate, setActivityDate] = React.useState(moment().format("YYYY-MM-DD"));
  const [resolutionDays, setResolutionDays] = React.useState(7);
  const [notifyCustomer, setNotifyCustomer] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!ticketId || !token) {
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiGet(`/tickets/${ticketId}/lm/context`, token);
      setCtx(data);
      const primary = data?.addresses?.find((a: any) => a.is_primary) ?? data?.addresses?.[0];
      setAddressId(primary?.id ?? null);
      const sr = data?.ticket_number ?? "";
      setName((current) => current || (sr ? `LM cabling — ${sr}` : "LM cabling"));
    } catch (err: any) {
      setLoadError(err?.message || "Could not load the Last Mile form");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  React.useEffect(() => {
    if (visible) {
      setError("");
      load();
    }
  }, [visible, load]);

  async function submit() {
    if (!addressId) {
      setError("Select the site address.");
      return;
    }
    if (!name.trim() || !description.trim()) {
      setError("Name and description are required.");
      return;
    }
    setError("");
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
      const result: any = await apiPost(`/tickets/${ticketId}/lm/handoff`, body, token, { timeoutMs: 45000 });
      if (notifyCustomer && result?.sms_sent === false) {
        showSuccess("Handed over to Last Mile (customer SMS could not be sent)");
      } else {
        showSuccess(notifyCustomer ? "Handed over to Last Mile. Customer notified by SMS." : "Handed over to Last Mile");
      }
      setDescription("");
      setNotes("");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showError(err?.message || "Handoff failed");
    } finally {
      setSubmitting(false);
    }
  }

  const addresses: any[] = ctx?.addresses ?? [];

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Hand over to Last Mile"
      subtitle="Creates a cabling activity for the Transport Network team pool."
      loading={submitting}
      footer={loadError ? undefined : { onSubmit: submit, submitText: "Hand over", submitDisabled: loading }}
    >
      {loadError ? (
        <ErrorState message={loadError} onRetry={load} compact />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={48} />
          <Skeleton height={96} />
          <Skeleton height={56} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="lm-name">
              Activity name
            </label>
            <input id="lm-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="lm-description">
              Description
            </label>
            <textarea
              id="lm-description"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What cabling work is needed?"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="lm-notes">
              Notes (optional)
            </label>
            <textarea id="lm-notes" className="textarea min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="field-label">Visit day</span>
            <DateChips value={activityDate} onChange={setActivityDate} days={14} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="field-label">Expected resolution</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {RESOLUTION_DAYS.map((days) => {
                const active = resolutionDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setResolutionDays(days)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-[13px]",
                      active ? "border-primary bg-info-bg font-semibold text-primary" : "border-borderlight text-gray2",
                    )}
                  >
                    {days} working days
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Send SMS to customer</p>
              <p className="mt-0.5 text-xs text-gray2">
                Tells the customer the ticket is with the Last Mile team and will be resolved within {resolutionDays} working
                days.
              </p>
            </div>
            <Switch checked={notifyCustomer} onChange={setNotifyCustomer} label="Send SMS to customer" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="field-label">Site address</span>
            {addresses.length === 0 ? (
              <EmptyState
                compact
                icon={MapPin}
                title="No addresses on file"
                message="Add an address to the customer in the CRM first."
              />
            ) : (
              addresses.map((addr: any) => {
                const active = addressId === addr.id;
                return (
                  <button
                    key={addr.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAddressId(addr.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-3 text-left",
                      active ? "border-primary bg-info-bg" : "border-borderlight",
                    )}
                  >
                    {active ? <CircleDot className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-gray3" />}
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        {addr.type ?? "Address"}
                        {addr.is_primary ? " · Primary" : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray2">
                        {[addr.address_line_1, addr.town_city].filter(Boolean).join(", ") || "No address details"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {error ? <p className="field-error">{error}</p> : null}
        </>
      )}
    </FormModal>
  );
}
