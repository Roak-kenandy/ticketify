export type TechnicianPresenceState = "online" | "busy" | "offline";

export type TechnicianPresenceSource = {
  presence?: "ONLINE" | "BUSY" | "OFFLINE" | string | null;
  availability?: boolean;
};

export function resolveTechnicianPresence(
  tech: TechnicianPresenceSource | null | undefined,
): TechnicianPresenceState {
  if (tech?.presence === "ONLINE") {
    return "online";
  }
  if (tech?.presence === "BUSY") {
    return "busy";
  }
  if (tech?.presence === "OFFLINE") {
    return "offline";
  }
  return tech?.availability ? "online" : "offline";
}

export const PRESENCE_UI: Record<
  TechnicianPresenceState,
  {
    markerColor: string;
    label: string;
    dotClass: string;
    textClass: string;
    pulseClass: string;
    badge: "success" | "warning" | "outline";
  }
> = {
  online: {
    markerColor: "#10b981",
    label: "Available",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
    pulseClass: "bg-emerald-500",
    badge: "success",
  },
  busy: {
    markerColor: "#f59e0b",
    label: "Busy",
    dotClass: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
    pulseClass: "bg-amber-500",
    badge: "warning",
  },
  offline: {
    markerColor: "#94a3b8",
    label: "Offline",
    dotClass: "bg-slate-400",
    textClass: "text-muted-foreground",
    pulseClass: "bg-slate-400",
    badge: "outline",
  },
};
