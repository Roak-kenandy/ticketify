"use client";

import { ArrowRightCircle, ChevronRight, PlayCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { ticketHref } from "@/components/field/ticket-card";
import { Skeleton } from "@/components/field/ui/state-views";
import { cn } from "@/lib/field/cn";
import { ticketStateMeta } from "@/lib/field/ticket-meta";

export default function StatsCard({ tickets, loading }: { tickets: any[]; loading?: boolean }) {
  const router = useRouter();
  const { counts, currentTask, nextTask } = React.useMemo(() => {
    const byState = (state: string) => tickets.filter((t) => t.state === state);
    const assigned = byState("NEW");
    const inProgress = byState("IN_PROGRESS");
    return {
      counts: { NEW: assigned.length, IN_PROGRESS: inProgress.length, CLOSED: byState("CLOSED").length },
      currentTask: inProgress[0],
      nextTask: assigned[0],
    };
  }, [tickets]);

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow-card">
      <div className="flex gap-2">
        {(["NEW", "IN_PROGRESS", "CLOSED"] as const).map((state) => {
          const tone = ticketStateMeta(state);
          return (
            <Link
              key={state}
              href={`/field/tickets?tab=${state}`}
              aria-label={`${tone.label}: ${counts[state]}`}
              className="flex flex-1 flex-col items-center gap-1 rounded-md py-3 active:opacity-80"
              style={{ backgroundColor: tone.bg }}
            >
              {loading ? (
                <Skeleton width={28} height={26} />
              ) : (
                <span className="text-[26px] font-bold leading-8" style={{ color: tone.color }}>
                  {counts[state]}
                </span>
              )}
              <span className="px-1 text-center text-[10px] font-semibold uppercase leading-tight text-gray2 min-[360px]:text-[11px] min-[360px]:tracking-wide">
                {tone.label}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <TaskRow
          icon={PlayCircle}
          label="Current job"
          task={currentTask}
          loading={loading}
          onOpen={() => currentTask && router.push(ticketHref(currentTask))}
        />
        <div className="h-px bg-borderlight" />
        <TaskRow
          icon={ArrowRightCircle}
          label="Next up"
          task={nextTask}
          loading={loading}
          onOpen={() => nextTask && router.push(ticketHref(nextTask))}
        />
      </div>
    </div>
  );
}

function TaskRow({
  icon: Icon,
  label,
  task,
  loading,
  onOpen,
}: {
  icon: LucideIcon;
  label: string;
  task: any;
  loading?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!task}
      className="flex min-h-8 items-center justify-between gap-3 text-left"
    >
      <span className="flex shrink-0 items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold text-ink">{label}</span>
      </span>
      {loading ? (
        <Skeleton width={90} height={14} />
      ) : (
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <span className={cn("truncate text-right text-[13px]", task ? "font-semibold text-primary" : "text-gray3")}>
            {task?.number ? `#${task.number}` : "Nothing yet"}
          </span>
          {task ? <ChevronRight className="h-4 w-4 text-gray3" /> : null}
        </span>
      )}
    </button>
  );
}
