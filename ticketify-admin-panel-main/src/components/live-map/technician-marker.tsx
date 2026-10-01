"use client";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/access";
import { PRESENCE_UI, resolveTechnicianPresence } from "@/lib/technician-presence";
import type { Technician } from "./types";

type TechnicianMarkerProps = {
  lat: number;
  lng: number;
  technician: Technician;
  selected: boolean;
  highlighted: boolean;
  onSelect: (technician: Technician) => void;
};

export function TechnicianMarker({
  technician,
  selected,
  highlighted,
  onSelect,
}: TechnicianMarkerProps) {
  const presence = resolveTechnicianPresence(technician);
  const ui = PRESENCE_UI[presence];

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(technician)}
        aria-label={`${technician.name}, ${ui.label}`}
        aria-pressed={selected}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white text-xs font-semibold text-white shadow-lg transition-transform duration-150 hover:scale-110 focus-visible:scale-110",
          (selected || highlighted) && "scale-110",
          selected && "ring-4 ring-primary/40",
        )}
        style={{ backgroundColor: ui.markerColor }}
      >
        {initials(technician.name)}
        {presence !== "offline" && (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 animate-ping rounded-full opacity-40 motion-reduce:hidden"
            style={{ backgroundColor: ui.markerColor }}
          />
        )}
      </button>

      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-950/90 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
          highlighted && !selected && "opacity-100",
        )}
      >
        <p className="font-medium">{technician.name}</p>
        <p className="text-slate-300">{ui.label}</p>
        {presence === "busy" && technician.busy_comment && (
          <p className="mt-0.5 whitespace-normal text-slate-300">{technician.busy_comment}</p>
        )}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-950/90" />
      </div>
    </div>
  );
}

export function WaypointMarker({
  active,
  passed,
  label,
  onClick,
}: {
  lat: number;
  lng: number;
  active: boolean;
  passed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "block rounded-full border-2 border-white shadow transition-all",
        active
          ? "h-5 w-5 bg-primary ring-4 ring-primary/30"
          : passed
            ? "h-2.5 w-2.5 bg-primary"
            : "h-2.5 w-2.5 bg-slate-400",
      )}
    />
  );
}
