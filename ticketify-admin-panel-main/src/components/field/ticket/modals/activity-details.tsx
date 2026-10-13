"use client";

import { CheckCircle2, Clock } from "lucide-react";
import moment from "moment";
import React from "react";
import { ToneBadge } from "@/components/field/ui/badge";
import FormModal from "@/components/field/ui/form-modal";
import { ErrorState, Skeleton } from "@/components/field/ui/state-views";
import { apiGet } from "@/lib/field/api";
import colors from "@/lib/field/colors";
import { lmStatusLabel, resolveCrmActivityState } from "@/lib/field/crm-activity";
import { useSession } from "@/lib/field/session";

export default function ActivityDetailModal({
  ticketId,
  activity,
  visible,
  onClose,
}: {
  ticketId: string;
  activity: any;
  visible: boolean;
  onClose: () => void;
}) {
  const { token } = useSession();
  const [details, setDetails] = React.useState<any>(null);
  const [error, setError] = React.useState("");
  const activityId = activity?.id;

  const load = React.useCallback(async () => {
    if (!activityId) {
      return;
    }
    setDetails(null);
    setError("");
    try {
      setDetails(
        await apiGet(
          `/tickets/${encodeURIComponent(ticketId)}/activities/${encodeURIComponent(activityId)}`,
          token,
        ),
      );
    } catch (err: any) {
      setError(err?.message || "Could not load the activity");
    }
  }, [ticketId, activityId, token]);

  React.useEffect(() => {
    if (visible) {
      load();
    }
  }, [visible, load]);

  const state = details ? resolveCrmActivityState(details) : null;
  const latestState = details?.states?.length
    ? [...details.states].sort((a: { date: number }, b: { date: number }) => b.date - a.date)[0]
    : null;

  return (
    <FormModal visible={visible} onClose={onClose} title={activity?.name || "Activity"} subtitle={activity?.type?.name}>
      {error ? (
        <ErrorState message={error} onRetry={load} compact />
      ) : !details ? (
        <div className="flex flex-col gap-3">
          <Skeleton width="40%" />
          <Skeleton height={44} />
          <Skeleton width="60%" />
          <Skeleton height={64} />
        </div>
      ) : (
        <>
          {state ? (
            <div className="flex items-center gap-2">
              <ToneBadge
                tone={
                  state === "COMPLETED"
                    ? { label: lmStatusLabel(state), color: colors.success, bg: colors.successBg, icon: CheckCircle2 }
                    : { label: lmStatusLabel(state), color: colors.info, bg: colors.infoBg, icon: Clock }
                }
                showIcon
              />
              {latestState ? (
                <span className="text-xs text-gray2">since {moment(latestState.date * 1000).format("DD MMM, hh:mm A")}</span>
              ) : null}
            </div>
          ) : null}

          {details.description ? (
            <Section title="Description">
              <p className="whitespace-pre-wrap text-sm leading-5 text-ink">{details.description}</p>
            </Section>
          ) : null}

          <Section title="Schedule">
            <p className="text-sm text-ink">
              {details.date ? moment(details.date * 1000).format("dddd, DD MMMM YYYY") : "Not scheduled"}
            </p>
            {details.created_date ? (
              <p className="text-xs text-gray2">
                Created {moment(details.created_date * 1000).format("DD MMM YYYY, hh:mm A")}
              </p>
            ) : null}
          </Section>

          <Section title="Assigned to">
            <p className="text-sm text-ink">
              {details.assigned_to?.user?.name || details.assigned_to?.team?.name || "Unassigned"}
            </p>
            {details.assigned_to?.user && details.assigned_to?.team?.name ? (
              <p className="text-xs text-gray2">{details.assigned_to.team.name}</p>
            ) : null}
          </Section>

          {details.contact ? (
            <Section title="Customer">
              <div className="flex flex-col gap-0.5 rounded-md bg-surface p-3">
                <p className="text-[15px] font-semibold text-ink">{details.contact.name}</p>
                {details.contact.code ? <p className="text-xs text-gray2">Code {details.contact.code}</p> : null}
                {details.contact.phone?.number ? <p className="text-sm text-ink">{details.contact.phone.number}</p> : null}
                {details.contact.primary_address ? (
                  <p className="text-sm text-ink">
                    {[details.contact.primary_address.address_line_1, details.contact.primary_address.town_city]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            </Section>
          ) : null}

          {Array.isArray(details.custom_fields) && details.custom_fields.length > 0 ? (
            <Section title="Details">
              {details.custom_fields.map((field: { label?: string; value?: unknown }, index: number) => (
                <div key={`${field.label}-${index}`} className="flex justify-between gap-3 py-1">
                  <span className="text-xs text-gray2">{field.label}</span>
                  <span className="shrink text-right text-[13px] text-ink">{String(field.value ?? "—")}</span>
                </div>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </FormModal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray2">{title}</h3>
      {children}
    </div>
  );
}
