"use client";

import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { SwitchRow } from "@/components/field/ui/switch";
import { apiPost, apiPut } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { useTickets } from "@/lib/field/tickets";

function CommentField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus
      />
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

export function AddNoteModal({
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
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");

  async function submit() {
    const text = note.trim();
    if (!text) {
      setError("Write a note before saving.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiPost(`/tickets/${ticketId}/notes`, { note: text, pinned: false }, token);
      showSuccess("Note added");
      setNote("");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showError(err?.message || "Could not add the note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        setError("");
        onClose();
      }}
      title="Add note"
      subtitle="Notes are saved to the ticket in the CRM."
      loading={submitting}
      footer={{ onSubmit: submit, submitText: "Save note" }}
    >
      <CommentField
        id="note"
        label="Note"
        value={note}
        onChange={(value) => {
          setNote(value);
          setError("");
        }}
        placeholder="What did you find or do on site?"
        disabled={submitting}
        error={error}
      />
    </FormModal>
  );
}

export function CloseTicketModal({
  ticketId,
  nextStage,
  visible,
  onClose,
  onSuccess,
}: {
  ticketId: string;
  nextStage: any;
  visible: boolean;
  onClose: () => void;
  onSuccess?: (updated: any) => void;
}) {
  const { token } = useSession();
  const { notifyTicketMutation } = useTickets();
  const [submitting, setSubmitting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");

  async function submit() {
    if (submitting) {
      return;
    }
    if (!note.trim()) {
      setError("Add a closing comment for the customer record.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await apiPut(
        `/tickets/${ticketId}/complete`,
        { comment: note.trim(), pinned: false, stage_id: nextStage?.id },
        token,
        { timeoutMs: 45000 },
      );
      const updated = await notifyTicketMutation(ticketId, { state: "CLOSED" }, { id: ticketId, state: "CLOSED" });
      showSuccess("Ticket closed");
      setNote("");
      onClose();
      onSuccess?.(updated);
    } catch (err: any) {
      showError(err?.message || "Could not close the ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        setError("");
        onClose();
      }}
      title="Close ticket"
      subtitle="This completes the job in the CRM. Make sure all work is done."
      loading={submitting}
      footer={{ onSubmit: submit, submitText: "Close ticket" }}
    >
      <CommentField
        id="closing-comment"
        label="Closing comment"
        value={note}
        onChange={(value) => {
          setNote(value);
          setError("");
        }}
        placeholder="Summarise the fix and anything the customer should know"
        disabled={submitting}
        error={error}
      />
    </FormModal>
  );
}

export function ProgressTicketModal({
  ticket,
  nextStage,
  visible,
  onClose,
  setSubmitted,
  onSuccess,
}: {
  ticket: any;
  nextStage: any;
  visible: boolean;
  onClose: () => void;
  setSubmitted: (value: boolean) => void;
  onSuccess?: (updated: any) => void;
}) {
  const { token } = useSession();
  const { notifyTicketMutation } = useTickets();
  const [submitting, setSubmitting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");
  const [notifyCustomer, setNotifyCustomer] = React.useState(true);

  async function submit() {
    if (submitting) {
      return;
    }
    if (!note.trim()) {
      setError("Add a short comment about this step.");
      return;
    }
    setError("");
    setSubmitting(true);
    setSubmitted(true);
    try {
      const data = await apiPut(
        `/tickets/${ticket.id}/progress?smsNotification=${notifyCustomer ? "true" : "false"}`,
        { comment: note.trim(), stage_id: nextStage?.id, stage_name: nextStage?.name },
        token,
        { timeoutMs: 45000 },
      );
      const updated = await notifyTicketMutation(
        ticket.id,
        { state: data?.state ?? "IN_PROGRESS", stage: data?.stage ?? nextStage ?? ticket.stage },
        { ...ticket, ...data, id: ticket.id },
      );
      showSuccess("Moved to next step");
      setNote("");
      onClose();
      onSuccess?.(updated);
    } catch (err: any) {
      showError(err?.message || "Could not update the ticket");
    } finally {
      setSubmitting(false);
      setSubmitted(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        setError("");
        onClose();
      }}
      title="Move to next step"
      subtitle={nextStage?.name ? `Next step: ${nextStage.name}` : undefined}
      loading={submitting}
      footer={{ onSubmit: submit, submitText: "Confirm" }}
    >
      <CommentField
        id="progress-comment"
        label="Comment"
        value={note}
        onChange={(value) => {
          setNote(value);
          setError("");
        }}
        placeholder="What was done in this step?"
        disabled={submitting}
        error={error}
      />
      <SwitchRow
        title="Notify customer"
        hint="Send an SMS update"
        checked={notifyCustomer}
        onChange={setNotifyCustomer}
        disabled={submitting}
      />
    </FormModal>
  );
}
