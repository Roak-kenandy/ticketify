"use client";

import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { apiGet, apiPatch, apiPut } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { useTickets } from "@/lib/field/tickets";

export type FmsEditField = "priority" | "status" | "queue" | "category" | "assign";

type Option = { id: string; label: string };
type Assignee = { id: string; email: string };

type EditOptions = {
  priorities: Option[];
  statuses: Option[];
  status_sub_comments: Option[];
  queues: Option[];
  queue_subcats: Option[];
  categories: Option[];
  assignees: Assignee[];
};

const TITLES: Record<FmsEditField, string> = {
  priority: "Change priority",
  status: "Change TT status",
  queue: "Change queue",
  category: "Change category",
  assign: "Assign user",
};

/** FMS Change popups — same fields/dropdowns as the Ooredoo portal. */
export default function FmsEditModal({
  ticketId,
  field,
  visible,
  onClose,
  onSuccess,
}: {
  ticketId: string;
  field: FmsEditField | null;
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { token } = useSession();
  const { notifyTicketMutation } = useTickets();
  const [loading, setLoading] = React.useState(false);
  const [booting, setBooting] = React.useState(false);
  const [options, setOptions] = React.useState<EditOptions | null>(null);
  const [subCategories, setSubCategories] = React.useState<Option[]>([]);
  const [priorityId, setPriorityId] = React.useState("");
  const [statusId, setStatusId] = React.useState("");
  const [statusSub, setStatusSub] = React.useState("");
  const [queueId, setQueueId] = React.useState("");
  const [queueSubcat, setQueueSubcat] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [subCategoryId, setSubCategoryId] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [comment, setComment] = React.useState("");

  const reset = React.useCallback(() => {
    setPriorityId("");
    setStatusId("");
    setStatusSub("");
    setQueueId("");
    setQueueSubcat("");
    setCategoryId("");
    setSubCategoryId("");
    setUserId("");
    setComment("");
    setSubCategories([]);
    setOptions(null);
  }, []);

  React.useEffect(() => {
    if (!visible || !field || !token) {
      return;
    }
    let cancelled = false;
    setBooting(true);
    reset();
    apiGet(`/tickets/${ticketId}/fms/options`, token, { timeoutMs: 60_000 })
      .then((data: EditOptions) => {
        if (!cancelled) setOptions(data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          showError(err?.message || "Could not load FMS options");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, field, token, ticketId, reset, onClose]);

  React.useEffect(() => {
    if (!visible || field !== "category" || !categoryId || !token) {
      setSubCategories([]);
      setSubCategoryId("");
      return;
    }
    let cancelled = false;
    apiGet(`/tickets/${ticketId}/fms/sub-categories/${categoryId}`, token, {
      silent: true,
    })
      .then((data) => {
        if (cancelled) return;
        setSubCategories(Array.isArray(data?.items) ? data.items : []);
        setSubCategoryId("");
      })
      .catch(() => {
        if (!cancelled) {
          setSubCategories([]);
          showError("Could not load sub-categories");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, field, categoryId, ticketId, token]);

  async function submit() {
    if (!field || !token) return;
    const note = comment.trim();
    if (!note) {
      showError("Add a short comment for the change");
      return;
    }
    if (field === "priority" && !priorityId) {
      showError("Choose a priority");
      return;
    }
    if (field === "status" && (!statusId || !statusSub)) {
      showError("Choose a status and sub-comment");
      return;
    }
    if (field === "queue" && (!queueId || !queueSubcat)) {
      showError("Choose a queue and sub-category");
      return;
    }
    if (field === "category" && (!categoryId || !subCategoryId)) {
      showError("Choose a category and sub-category");
      return;
    }
    if (field === "assign" && !userId) {
      showError("Choose a technician");
      return;
    }

    setLoading(true);
    try {
      let updated: any = null;
      if (field === "priority") {
        updated = await apiPatch(
          `/tickets/${ticketId}/fms/priority`,
          { priority_id: priorityId, comment: note },
          token,
          { timeoutMs: 45_000 },
        );
      } else if (field === "status") {
        updated = await apiPatch(
          `/tickets/${ticketId}/fms/status`,
          {
            ticket_status: statusId,
            ticket_sub_comment: statusSub,
            comment: note,
          },
          token,
          { timeoutMs: 45_000 },
        );
      } else if (field === "queue") {
        updated = await apiPatch(
          `/tickets/${ticketId}/fms/queue`,
          { que_id: queueId, t_subcat: queueSubcat, comment: note },
          token,
          { timeoutMs: 45_000 },
        );
      } else if (field === "category") {
        updated = await apiPatch(
          `/tickets/${ticketId}/fms/category`,
          {
            category: categoryId,
            sub_category: subCategoryId,
            comment: note,
          },
          token,
          { timeoutMs: 45_000 },
        );
      } else if (field === "assign") {
        updated = await apiPut(
          `/tickets/${ticketId}/assign`,
          { user_id: userId, comment: note },
          token,
          { timeoutMs: 45_000 },
        );
      }
      if (updated) {
        await notifyTicketMutation(ticketId, {}, updated);
      }
      showSuccess("FMS ticket updated");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showError(err?.message || "Could not update the ticket");
    } finally {
      setLoading(false);
    }
  }

  if (!field) return null;

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={TITLES[field]}
      subtitle="Saved to Ooredoo FMS like the portal Change dialogs."
      loading={loading || booting}
      footer={
        booting
          ? undefined
          : { onSubmit: submit, submitText: "Update", submitDisabled: loading }
      }
    >
      {booting || !options ? (
        <p className="text-sm text-gray2">Loading options from FMS…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {field === "priority" ? (
            <SelectField
              label="Priority"
              value={priorityId}
              onChange={setPriorityId}
              options={options.priorities}
            />
          ) : null}
          {field === "status" ? (
            <>
              <SelectField
                label="TT status"
                value={statusId}
                onChange={setStatusId}
                options={options.statuses}
              />
              <SelectField
                label="Sub-comment"
                value={statusSub}
                onChange={setStatusSub}
                options={options.status_sub_comments}
              />
            </>
          ) : null}
          {field === "queue" ? (
            <>
              <SelectField
                label="Queue"
                value={queueId}
                onChange={setQueueId}
                options={options.queues}
              />
              <SelectField
                label="Queue sub-category"
                value={queueSubcat}
                onChange={setQueueSubcat}
                options={options.queue_subcats}
              />
            </>
          ) : null}
          {field === "category" ? (
            <>
              <SelectField
                label="Category"
                value={categoryId}
                onChange={setCategoryId}
                options={options.categories}
              />
              <SelectField
                label="Sub-category"
                value={subCategoryId}
                onChange={setSubCategoryId}
                options={subCategories}
                disabled={!categoryId}
                emptyText={categoryId ? "No sub-categories" : "Choose a category first"}
              />
            </>
          ) : null}
          {field === "assign" ? (
            <SelectField
              label="Technician"
              value={userId}
              onChange={setUserId}
              options={options.assignees.map((a) => ({
                id: a.id,
                label: a.email,
              }))}
            />
          ) : null}
          <div className="flex flex-col gap-1">
            <label className="field-label" htmlFor="fms-comment">
              Comment
            </label>
            <textarea
              id="fms-comment"
              className="textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a short comment"
              disabled={loading}
            />
          </div>
        </div>
      )}
    </FormModal>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  emptyText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label">{label}</label>
      <select
        className="input"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {options.length ? "Please select" : emptyText || "No options"}
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
