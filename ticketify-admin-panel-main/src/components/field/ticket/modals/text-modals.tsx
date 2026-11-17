"use client";

import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { SwitchRow } from "@/components/field/ui/switch";
import { apiGet, apiPost, apiPut } from "@/lib/field/api";
import { ticketSystem } from "@/lib/field/app";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { useTickets } from "@/lib/field/tickets";

type FmsOption = { id: string; label: string };

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
  const { token, user } = useSession();
  const [submitting, setSubmitting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");
  const system = ticketSystem({ userSource: user?.source, ticketId });

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
      subtitle={`Notes are saved to the ticket in ${system}.`}
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
  const { token, user } = useSession();
  const { notifyTicketMutation } = useTickets();
  const [submitting, setSubmitting] = React.useState(false);
  const [booting, setBooting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");
  const [statusId, setStatusId] = React.useState("");
  const [statusSub, setStatusSub] = React.useState("");
  const [statuses, setStatuses] = React.useState<FmsOption[]>([]);
  const [subComments, setSubComments] = React.useState<FmsOption[]>([]);
  const system = ticketSystem({ userSource: user?.source, ticketId });
  const isFms = system === "FMS";

  React.useEffect(() => {
    if (!visible || !isFms || !token) {
      return;
    }
    let cancelled = false;
    setBooting(true);
    setStatusId("");
    setStatusSub("");
    setError("");
    apiGet(`/tickets/${ticketId}/fms/options`, token, { timeoutMs: 60_000 })
      .then((data) => {
        if (cancelled) return;
        setStatuses(Array.isArray(data?.statuses) ? data.statuses : []);
        setSubComments(
          Array.isArray(data?.status_sub_comments) ? data.status_sub_comments : [],
        );
      })
      .catch((err: any) => {
        if (!cancelled) {
          showError(err?.message || "Could not load TT status options from FMS");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, isFms, token, ticketId, onClose]);

  async function submit() {
    if (submitting || booting) {
      return;
    }
    if (isFms) {
      if (!statusId) {
        setError("Choose a TT status.");
        return;
      }
      if (!statusSub) {
        setError("Choose a status sub-comment.");
        return;
      }
    }
    if (!note.trim()) {
      setError(
        isFms
          ? "Add a closing comment."
          : "Add a closing comment for the customer record.",
      );
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const body = isFms
        ? {
            comment: note.trim(),
            ticket_status: statusId,
            closing_sub_comment: statusSub,
            pinned: false,
          }
        : {
            comment: note.trim(),
            pinned: false,
            stage_id: nextStage?.id,
          };
      const result = await apiPut(`/tickets/${ticketId}/complete`, body, token, {
        timeoutMs: 45000,
      });
      const updated = await notifyTicketMutation(
        ticketId,
        { state: result?.state ?? "CLOSED" },
        result ?? { id: ticketId, state: "CLOSED" },
      );
      showSuccess(isFms ? "TT status saved in FMS" : "Ticket closed");
      setNote("");
      setStatusId("");
      setStatusSub("");
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
        if (submitting) return;
        setError("");
        onClose();
      }}
      title="Close ticket"
      subtitle={
        isFms
          ? "Same as FMS Change TT status — pick the status and sub-comment, then save."
          : "This completes the job in the CRM. Make sure all work is done."
      }
      loading={submitting || (isFms && booting)}
      footer={
        isFms && booting
          ? undefined
          : { onSubmit: submit, submitText: isFms ? "Save status" : "Close ticket" }
      }
    >
      {isFms && booting ? (
        <p className="text-sm text-gray2">Loading TT status options from FMS…</p>
      ) : null}
      {isFms && !booting ? (
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="close-tt-status">
              TT status
            </label>
            <select
              id="close-tt-status"
              className="input"
              value={statusId}
              disabled={submitting || statuses.length === 0}
              onChange={(e) => {
                setStatusId(e.target.value);
                setError("");
              }}
            >
              <option value="">
                {statuses.length ? "Please select" : "No statuses from FMS"}
              </option>
              {statuses.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="close-tt-sub">
              Sub-comment
            </label>
            <select
              id="close-tt-sub"
              className="input"
              value={statusSub}
              disabled={submitting || subComments.length === 0}
              onChange={(e) => {
                setStatusSub(e.target.value);
                setError("");
              }}
            >
              <option value="">
                {subComments.length ? "Please select" : "No sub-comments from FMS"}
              </option>
              {subComments.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      {!(isFms && booting) ? (
        <CommentField
          id="closing-comment"
          label="Closing comment"
          value={note}
          onChange={(value) => {
            setNote(value);
            setError("");
          }}
          placeholder={
            isFms
              ? "Short comment for the FMS status change"
              : "Summarise the fix and anything the customer should know"
          }
          disabled={submitting}
          error={error}
        />
      ) : null}
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
