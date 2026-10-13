"use client";

import moment from "moment";
import React from "react";
import { DateChips, nextSlot, TimeChips } from "@/components/field/ui/date-time-chips";
import FormModal from "@/components/field/ui/form-modal";
import { SwitchRow } from "@/components/field/ui/switch";
import { apiPut } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

export default function ScheduleVisitModal({
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
  const [submitting, setSubmitting] = React.useState(false);
  const [dateStr, setDateStr] = React.useState(() => nextSlot().date);
  const [timeStr, setTimeStr] = React.useState(() => nextSlot().time);
  const [notifyCustomer, setNotifyCustomer] = React.useState(true);

  React.useEffect(() => {
    if (visible) {
      const slot = nextSlot();
      setDateStr(slot.date);
      setTimeStr(slot.time);
    }
  }, [visible]);

  const scheduledAt = moment(`${dateStr} ${timeStr}`, "YYYY-MM-DD HH:mm", true);
  const isValid = scheduledAt.isValid() && scheduledAt.isAfter(moment());

  async function submit() {
    if (!ticketId || !token) {
      return;
    }
    if (!isValid) {
      showError("Pick a time later than now");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiPut(
        `/tickets/${ticketId}/schedule`,
        { scheduled_at: scheduledAt.toISOString(), notify_customer: notifyCustomer },
        token,
      );
      showSuccess(data?.sms_sent ? "Visit scheduled, customer notified" : "Visit scheduled");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showError(err?.message || "Could not schedule the visit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title="Schedule visit"
      subtitle="Adds a note to the ticket and can text the customer."
      loading={submitting}
      footer={{ onSubmit: submit, submitText: "Schedule", submitDisabled: !isValid }}
    >
      <div className="flex flex-col gap-1">
        <span className="field-label">Day</span>
        <DateChips value={dateStr} onChange={setDateStr} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="field-label">Time</span>
        <TimeChips value={timeStr} onChange={setTimeStr} date={dateStr} />
      </div>
      <div className="rounded-md bg-info-bg p-3">
        <p className="text-sm font-semibold text-info">
          {isValid ? scheduledAt.format("dddd, D MMMM [at] h:mm A") : "Choose a time later than now"}
        </p>
      </div>
      <SwitchRow
        title="Notify customer"
        hint="Send the visit time by SMS"
        checked={notifyCustomer}
        onChange={setNotifyCustomer}
        disabled={submitting}
      />
    </FormModal>
  );
}
