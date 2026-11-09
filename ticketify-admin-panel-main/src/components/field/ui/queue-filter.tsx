"use client";

import React from "react";
import { cn } from "@/lib/field/cn";

export const QUEUE_FILTERS = [
  { key: "ALL", label: "All", match: null },
  { key: "NEW_CONNECTION", label: "New connection", match: /new\s*connection/i },
  { key: "RELOCATION", label: "Relocation", match: /relocation/i },
  { key: "FAULT", label: "Fault", match: /fault/i },
  { key: "CUSTOMER_INQUIRY", label: "Customer inquiry", match: /customer\s*inquiry|enquiry/i },
] as const;

export type QueueFilterKey = (typeof QUEUE_FILTERS)[number]["key"];

const STORAGE_KEY = "field.queueFilter";

export function matchesQueue(ticket: any, key: QueueFilterKey): boolean {
  const filter = QUEUE_FILTERS.find((each) => each.key === key);
  if (!filter?.match) return true;
  return filter.match.test(String(ticket?.queue?.name ?? ""));
}

/** The chosen queue filter, remembered on this device and shared by the dashboard and My tickets. */
export function useQueueFilter(): [QueueFilterKey, (key: QueueFilterKey) => void] {
  const [key, setKey] = React.useState<QueueFilterKey>("ALL");

  React.useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (QUEUE_FILTERS.some((each) => each.key === saved)) setKey(saved as QueueFilterKey);
  }, []);

  const update = React.useCallback((next: QueueFilterKey) => {
    setKey(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return [key, update];
}

export function QueueFilter({
  value,
  onChange,
  tickets,
  className,
}: {
  value: QueueFilterKey;
  onChange: (key: QueueFilterKey) => void;
  /** Counts each chip from these tickets. */
  tickets?: any[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Ticket type"
      className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]", className)}
    >
      {QUEUE_FILTERS.map((filter) => {
        const on = filter.key === value;
        const count = tickets?.filter((ticket) => matchesQueue(ticket, filter.key)).length;
        return (
          <button
            key={filter.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(filter.key)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
              on ? "border-primary bg-primary text-white" : "border-borderlight bg-white text-ink",
            )}
          >
            {filter.label}
            {count !== undefined ? (
              <span
                className={cn(
                  "min-w-[20px] rounded-full px-1.5 text-center text-[11px] tabular-nums",
                  on ? "bg-white/20 text-white" : "bg-surface text-gray2",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
