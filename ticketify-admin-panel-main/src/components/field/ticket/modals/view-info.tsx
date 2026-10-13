"use client";

import { Check, GitCommitHorizontal } from "lucide-react";
import moment from "moment";
import React from "react";
import FormModal from "@/components/field/ui/form-modal";
import { EmptyState } from "@/components/field/ui/state-views";
import colors from "@/lib/field/colors";
import { cn } from "@/lib/field/cn";

/** Stage timeline for the ticket's CRM queue. */
export default function ViewInfoModal({
  ticket,
  visible,
  onClose,
}: {
  ticket: any;
  visible: boolean;
  onClose: () => void;
}) {
  const stages: any[] = React.useMemo(
    () => [...(ticket?.queue_info?.stages ?? [])].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)),
    [ticket?.queue_info?.stages],
  );
  const history: any[] = ticket?.queue?.content ?? [];
  const currentIndex = stages.findIndex((stage) => stage.id === ticket?.stage?.id);

  return (
    <FormModal visible={visible} onClose={onClose} title="Ticket progress" subtitle={ticket?.queue_info?.name}>
      {stages.length === 0 ? (
        <EmptyState compact icon={GitCommitHorizontal} title="No stages" message="This ticket's queue has no workflow stages." />
      ) : (
        <div>
          {stages.map((stage, index) => {
            const done = currentIndex >= 0 && index < currentIndex;
            const current = index === currentIndex;
            const entries = history.filter((entry) => entry?.stage?.id === stage.id);
            const tint = current ? colors.primary : done ? colors.success : colors.bordergray;
            return (
              <div key={stage.id ?? index} className="flex gap-3">
                <div className="flex w-5 flex-col items-center">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white"
                    style={{ borderColor: tint, backgroundColor: done || current ? tint : undefined }}
                  >
                    {done ? <Check className="h-3 w-3 text-white" /> : null}
                  </div>
                  {index < stages.length - 1 ? (
                    <div className={cn("my-0.5 min-h-4 w-0.5 flex-1", done ? "bg-success" : "bg-bordergray")} />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-semibold", current ? "text-primary" : "text-ink")}>{stage.name}</span>
                    {current ? (
                      <span className="rounded-full bg-tertiary px-2 py-0.5 text-[11px] font-bold text-primary">Current</span>
                    ) : null}
                  </div>
                  {entries.map((entry, entryIndex) => (
                    <div key={`${stage.id}-${entryIndex}`} className="flex flex-col gap-0.5 rounded-sm bg-surface p-2">
                      {entry?.comment ? <p className="text-[13px] text-ink">{entry.comment}</p> : null}
                      <p className="text-[11px] text-gray2">
                        {entry?.date_achieved ? moment(entry.date_achieved * 1000).format("DD MMM YYYY, h:mm A") : ""}
                        {" · "}
                        {entry?.performed_by?.username || "System"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </FormModal>
  );
}
