"use client";

import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { apiDelete, apiGet, apiPost } from "@/lib/field/api";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";

type Helper = {
  user_id: string;
  name?: string | null;
  email?: string;
};

type Candidate = {
  id: string;
  name?: string | null;
  email?: string;
  presence?: string;
  role?: string | null;
};

function normalizeHelpers(payload: unknown, fallback: Helper[]): Helper[] {
  if (Array.isArray(payload)) return payload as Helper[];
  if (payload && typeof payload === "object" && Array.isArray((payload as any).items)) {
    return (payload as any).items as Helper[];
  }
  return fallback;
}

/** Primary tech picks up to two Medianet helpers who share this CRM job + customer review. */
export default function HelpersModal({
  ticketId,
  visible,
  helpers,
  onClose,
  onChanged,
}: {
  ticketId: string;
  visible: boolean;
  helpers: Helper[];
  onClose: () => void;
  onChanged: (next: Helper[]) => void;
}) {
  const { token } = useSession();
  const [booting, setBooting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selected, setSelected] = React.useState("");

  React.useEffect(() => {
    if (!visible || !token) return;
    let cancelled = false;
    setBooting(true);
    setSelected("");
    apiGet(`/tickets/${ticketId}/helpers/candidates`, token, { timeoutMs: 30_000 })
      .then((data) => {
        if (cancelled) return;
        setCandidates(Array.isArray(data) ? data : []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          showError(err?.message || "Could not load technicians");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, ticketId, onClose]);

  async function addHelper() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const next = await apiPost(
        `/tickets/${ticketId}/helpers`,
        { user_id: selected },
        token,
        { timeoutMs: 30_000 },
      );
      onChanged(normalizeHelpers(next, helpers));
      showSuccess("Helper added");
      setSelected("");
      onClose();
    } catch (err: any) {
      showError(err?.message || "Could not add helper");
    } finally {
      setBusy(false);
    }
  }

  async function removeHelper(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await apiDelete(`/tickets/${ticketId}/helpers/${userId}`, token, {
        timeoutMs: 30_000,
      });
      onChanged(normalizeHelpers(next, []));
      showSuccess("Helper removed");
    } catch (err: any) {
      showError(err?.message || "Could not remove helper");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Work with another tech"
      subtitle="Same CRM ticket. Customer leaves one review — both of you get the credit."
      loading={busy || booting}
      footer={
        booting
          ? undefined
          : {
              onSubmit: addHelper,
              submitText: "Add helper",
              submitDisabled: !selected || helpers.length >= 2 || busy,
            }
      }
    >
      {booting ? (
        <p className="text-sm text-gray2">Loading technicians…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {helpers.length ? (
            <ul className="space-y-2">
              {helpers.map((helper) => (
                <li
                  key={helper.user_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-borderlight px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {helper.name || helper.email || "Technician"}
                    </p>
                    {helper.email ? (
                      <p className="truncate text-xs text-gray2">{helper.email}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-semibold text-destructive"
                    disabled={busy}
                    onClick={() => removeHelper(helper.user_id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray2">No helpers on this ticket yet.</p>
          )}

          {helpers.length >= 2 ? (
            <p className="text-sm text-gray2">Maximum of 2 helpers on one ticket.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="field-label" htmlFor="helper-pick">
                Add technician
              </label>
              <select
                id="helper-pick"
                className="input"
                value={selected}
                disabled={busy || candidates.length === 0}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">
                  {candidates.length ? "Please select" : "No other Medianet techs in mPro"}
                </option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[
                      c.name || c.email || "Technician",
                      c.role,
                      c.presence ? c.presence.toLowerCase() : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
              {candidates.length === 0 ? (
                <p className="text-xs text-gray2">
                  Helpers must be other active Medianet Technician or Supervisor
                  accounts in mPro (not you, and not Ooredoo users). Create another
                  Medianet tech under Admin → Users if you need to test this.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </FormModal>
  );
}
