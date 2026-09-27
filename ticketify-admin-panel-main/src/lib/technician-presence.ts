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
  }
> = {
  online: {
    markerColor: "#10b981",
    label: "Available",
    dotClass: "bg-green-500",
    textClass: "text-green-400",
    pulseClass: "bg-green-500",
  },
  busy: {
    markerColor: "#eab308",
    label: "Busy",
    dotClass: "bg-yellow-500",
    textClass: "text-yellow-400",
    pulseClass: "bg-yellow-500",
  },
  offline: {
    markerColor: "#dc2626",
    label: "Offline",
    dotClass: "bg-red-500",
    textClass: "text-red-400",
    pulseClass: "bg-red-500",
  },
};
