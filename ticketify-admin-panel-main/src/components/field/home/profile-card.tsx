"use client";

import { Menu } from "lucide-react";
import React from "react";
import { useDrawer } from "@/components/field/shell/app-shell";
import FormModal from "@/components/field/ui/form-modal";
import { apiPatch } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { fieldContainer } from "@/lib/field/layout";
import { showError } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { PRESENCE_META, presenceFromUser, type Presence } from "@/lib/field/ticket-meta";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string) {
  return String(name ?? "").trim().split(/\s+/)[0] || "there";
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

/** Dashboard header: menu, greeting and the Available / Busy / Offline switch. */
export default function ProfileCard() {
  const drawer = useDrawer();
  const { token, user, updateUser } = useSession();
  const requestRef = React.useRef(0);
  const [busyModal, setBusyModal] = React.useState(false);
  const [busyComment, setBusyComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const presence = presenceFromUser(user);

  async function applyPresence(next: Presence, comment?: string) {
    if (!token) {
      return;
    }
    const previous = presence;
    const previousComment = user?.busy_comment ?? null;
    if (previous === next && next !== "BUSY") {
      return;
    }
    const requestId = ++requestRef.current;
    updateUser({
      presence: next,
      availability: next === "ONLINE",
      busy_comment: next === "BUSY" ? comment : null,
    });
    setSubmitting(true);
    try {
      const body: Record<string, string> = { presence: next };
      if (next === "BUSY" && comment) {
        body.busy_comment = comment;
      }
      const data = await apiPatch("/users/presence", body, token);
      if (requestId !== requestRef.current) {
        return;
      }
      updateUser({
        presence: data?.presence ?? next,
        availability: data?.availability === true || data?.availability === "AVAILABLE",
        busy_comment: data?.busy_comment ?? null,
        busy_until: data?.busy_until ?? null,
      });
    } catch (error: any) {
      if (requestId !== requestRef.current) {
        return;
      }
      updateUser({ presence: previous, availability: previous === "ONLINE", busy_comment: previousComment });
      showError(error?.message || "Could not update status");
    } finally {
      if (requestId === requestRef.current) {
        setSubmitting(false);
      }
    }
  }

  const onSelect = (next: Presence) => {
    if (submitting) {
      return;
    }
    if (next === "BUSY") {
      setBusyComment("");
      setBusyModal(true);
      return;
    }
    void applyPresence(next);
  };

  return (
    <header className="sticky top-0 z-30 bg-primary pt-[env(safe-area-inset-top)]">
      <div className={cn(fieldContainer.wide, "flex items-center justify-between px-4 pb-3 pt-3 sm:pb-4")}>
        <div className="mr-2 flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={drawer.open}
            aria-label="Open menu"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md bg-white lg:hidden"
          >
            <Menu className="h-[26px] w-[26px] text-primary" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold text-white">
              {greeting()}, {firstName(user?.name)}
            </p>
            <p className="mt-0.5 truncate text-xs text-white/75">{todayLabel()}</p>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 p-1"
          role="radiogroup"
          aria-label="Availability"
        >
          {(["ONLINE", "BUSY", "OFFLINE"] as Presence[]).map((key) => {
            const meta = PRESENCE_META[key];
            const active = presence === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${meta.label}: ${meta.description}`}
                title={meta.description}
                disabled={submitting}
                onClick={() => onSelect(key)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:cursor-wait",
                  active ? "bg-white text-ink shadow-sm" : "text-white/75 hover:text-white",
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                <span className={cn(!active && "hidden sm:inline")}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <FormModal
        visible={busyModal}
        onClose={() => setBusyModal(false)}
        title="Busy (yellow)"
        subtitle="Describe your current workload so supervisors can assign tickets appropriately."
        loading={submitting}
        footer={{
          submitText: "Set busy",
          submitDisabled: !busyComment.trim(),
          onSubmit: () => {
            setBusyModal(false);
            void applyPresence("BUSY", busyComment.trim());
          },
        }}
      >
        <textarea
          className="textarea min-h-[88px]"
          value={busyComment}
          onChange={(event) => setBusyComment(event.target.value)}
          placeholder="e.g. Two installs in Hulhumalé until 16:00"
          maxLength={500}
          autoFocus
        />
      </FormModal>
    </header>
  );
}
