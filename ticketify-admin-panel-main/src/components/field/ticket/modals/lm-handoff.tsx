"use client";

import { Circle, CircleDot, MapPin } from "lucide-react";
import moment from "moment";
import React from "react";
import { DateChips } from "@/components/field/ui/date-time-chips";
import FormModal from "@/components/field/ui/form-modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/field/ui/state-views";
import { SwitchRow } from "@/components/field/ui/switch";
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
  const [missing, setMissing] = React.useState<"name" | "description" | "address" | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const descriptionRef = React.useRef<HTMLTextAreaElement>(null);
  const addressRef = React.useRef<HTMLDivElement>(null);

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
      setMissing(null);
      load();
    }
  }, [visible, load]);

  async function submit() {
    const problem = !name.trim()
      ? { field: "name" as const, text: "Enter an activity name.", el: nameRef.current }
      : !description.trim()
        ? { field: "description" as const, text: "Describe the cabling work needed.", el: descriptionRef.current }
        : !addressId
          ? {
              field: "address" as const,
              text: addresses.length ? "Select the site address." : "The customer has no address in the CRM. Add one there first.",
              el: addressRef.current,
            }
          : null;
    if (problem) {
      setMissing(problem.field);
      setError(problem.text);
      showError(problem.text);
      problem.el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (problem.el instanceof HTMLInputElement || problem.el instanceof HTMLTextAreaElement) problem.el.focus();
      return;
    }
    setMissing(null);
    setError("");
    setSubmitting(true);
    try {
      const body: Record<string, string | number | boolean> = {
        name: name.trim(),
        description: description.trim(),
        address_id: addressId as string,
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
              Activity name <span className="text-error">*</span>
            </label>
            <input
              id="lm-name"
              ref={nameRef}
              className={cn("input", missing === "name" && "border-error")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (missing === "name") setMissing(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="lm-description">
              Description <span className="text-error">*</span>
            </label>
            <textarea
              id="lm-description"
              ref={descriptionRef}
              className={cn("textarea", missing === "description" && "border-error")}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (missing === "description") setMissing(null);
              }}
              placeholder="What cabling work is needed?"
            />
            {missing === "description" ? <p className="field-error">{error}</p> : null}
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
          <SwitchRow
            title="Send SMS to customer"
            hint={`Tells the customer the ticket is with the Last Mile team and will be resolved within ${resolutionDays} working days.`}
            checked={notifyCustomer}
            onChange={setNotifyCustomer}
          />
          <div ref={addressRef} className="flex flex-col gap-2">
            <span className="field-label">
              Site address <span className="text-error">*</span>
            </span>
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
                    onClick={() => {
                      setAddressId(addr.id);
                      if (missing === "address") setMissing(null);
                    }}
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
          {error && missing !== "description" ? <p className="field-error">{error}</p> : null}
        </>
      )}
    </FormModal>
  );
}
