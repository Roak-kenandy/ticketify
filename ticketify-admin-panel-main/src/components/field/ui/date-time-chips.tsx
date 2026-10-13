"use client";

import moment from "moment";
import React from "react";
import { cn } from "@/lib/field/cn";

function Chip({
  label,
  sub,
  active,
  onClick,
  disabled,
}: {
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "min-w-16 shrink-0 rounded-md border px-3 py-2 text-center",
        active ? "border-primary bg-primary" : "border-borderlight bg-white",
        disabled && "opacity-35",
      )}
    >
      <span className={cn("block text-[13px] font-semibold", active ? "text-white" : "text-ink")}>
        {label}
      </span>
      {sub ? (
        <span className={cn("mt-px block text-[11px]", active ? "text-white" : "text-gray2")}>{sub}</span>
      ) : null}
    </button>
  );
}

/** Horizontal day picker: Today, Tomorrow, then weekday chips. Value is YYYY-MM-DD. */
export function DateChips({
  value,
  onChange,
  days = 10,
  includePast = 0,
}: {
  value: string;
  onChange: (date: string) => void;
  days?: number;
  includePast?: number;
}) {
  const options = React.useMemo(() => {
    const start = moment().startOf("day").subtract(includePast, "days");
    return Array.from({ length: days + includePast }, (_, i) => {
      const day = start.clone().add(i, "days");
      const diff = day.diff(moment().startOf("day"), "days");
      const label =
        diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : day.format("ddd");
      return { key: day.format("YYYY-MM-DD"), label, sub: day.format("D MMM") };
    });
  }, [days, includePast]);

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto py-0.5">
      {options.map((option) => (
        <Chip
          key={option.key}
          label={option.label}
          sub={option.sub}
          active={value === option.key}
          onClick={() => onChange(option.key)}
        />
      ))}
    </div>
  );
}

/** Time slots in 30-minute steps. Past slots are disabled when `date` is today. */
export function TimeChips({
  value,
  onChange,
  date,
  startHour = 8,
  endHour = 21,
  stepMinutes = 30,
}: {
  value: string;
  onChange: (time: string) => void;
  date: string;
  startHour?: number;
  endHour?: number;
  stepMinutes?: number;
}) {
  const isToday = date === moment().format("YYYY-MM-DD");
  const slots = React.useMemo(() => {
    const out: { key: string; label: string; past: boolean }[] = [];
    const now = moment();
    for (let m = startHour * 60; m <= endHour * 60; m += stepMinutes) {
      const slot = moment(date, "YYYY-MM-DD").startOf("day").add(m, "minutes");
      out.push({ key: slot.format("HH:mm"), label: slot.format("h:mm A"), past: isToday && slot.isBefore(now) });
    }
    return out;
  }, [date, endHour, isToday, startHour, stepMinutes]);

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto py-0.5">
      {slots.map((slot) => (
        <Chip
          key={slot.key}
          label={slot.label}
          active={value === slot.key}
          disabled={slot.past}
          onClick={() => onChange(slot.key)}
        />
      ))}
    </div>
  );
}

/** Next selectable 30-minute slot at least `leadMinutes` from now. */
export function nextSlot(leadMinutes = 60): { date: string; time: string } {
  const t = moment().add(leadMinutes, "minutes");
  const remainder = t.minute() % 30;
  if (remainder) {
    t.add(30 - remainder, "minutes");
  }
  t.seconds(0);
  if (t.hour() >= 21 || t.hour() < 8) {
    const next = (t.hour() >= 21 ? t.clone().add(1, "day") : t.clone()).hour(9).minute(0);
    return { date: next.format("YYYY-MM-DD"), time: next.format("HH:mm") };
  }
  return { date: t.format("YYYY-MM-DD"), time: t.format("HH:mm") };
}
