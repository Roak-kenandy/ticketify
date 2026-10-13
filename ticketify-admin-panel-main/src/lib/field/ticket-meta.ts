import {
  ArrowDown,
  ArrowUp,
  CheckCheck,
  CircleDot,
  CircleHelp,
  Clock,
  Flame,
  Mail,
  Minus,
  Moon,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import colors from "./colors";

export type Tone = {
  label: string;
  color: string;
  bg: string;
  icon?: LucideIcon | null;
};

/** Same palette as the admin panel: new = info, in progress = warning, closed = success. */
const STATE_META: Record<string, Tone> = {
  NEW: { label: "Assigned", color: colors.info, bg: colors.infoBg, icon: Mail },
  IN_PROGRESS: {
    label: "In progress",
    color: colors.warning,
    bg: colors.warningBg,
    icon: Wrench,
  },
  CLOSED: {
    label: "Completed",
    color: colors.success,
    bg: colors.successBg,
    icon: CheckCheck,
  },
};

export function ticketStateMeta(state?: string): Tone {
  return (
    STATE_META[String(state ?? "").toUpperCase()] ?? {
      label: state ? humanize(state) : "Unknown",
      color: colors.gray2,
      bg: colors.surface,
      icon: CircleHelp,
    }
  );
}

const PRIORITY_META: Record<string, Tone> = {
  URGENT: { label: "Urgent", color: colors.error, bg: colors.errorBg, icon: Flame },
  CRITICAL: { label: "Critical", color: colors.error, bg: colors.errorBg, icon: Flame },
  HIGH: { label: "High", color: colors.warning, bg: colors.warningBg, icon: ArrowUp },
  MEDIUM: { label: "Medium", color: "#B45309", bg: "#FEF3C7", icon: Minus },
  NORMAL: { label: "Normal", color: colors.info, bg: colors.infoBg, icon: Minus },
  LOW: { label: "Low", color: colors.gray2, bg: colors.surface, icon: ArrowDown },
};

export function priorityMeta(priority?: string): Tone {
  return (
    PRIORITY_META[String(priority ?? "").toUpperCase()] ?? {
      label: priority ? humanize(priority) : "Normal",
      color: colors.info,
      bg: colors.infoBg,
      icon: Minus,
    }
  );
}

export type Presence = "ONLINE" | "BUSY" | "OFFLINE";

export const PRESENCE_META: Record<
  Presence,
  { label: string; description: string; color: string; bg: string; icon: LucideIcon }
> = {
  ONLINE: {
    label: "Available",
    description: "Ready for new jobs",
    color: "#16A34A",
    bg: "#DCFCE7",
    icon: CircleDot,
  },
  BUSY: {
    label: "Busy",
    description: "On a job, no new work",
    color: "#CA8A04",
    bg: "#FEF9C3",
    icon: Clock,
  },
  OFFLINE: {
    label: "Offline",
    description: "Not working",
    color: "#DC2626",
    bg: "#FEE2E2",
    icon: Moon,
  },
};

export function presenceFromUser(user: any): Presence {
  const p = user?.presence;
  if (p === "ONLINE" || p === "BUSY" || p === "OFFLINE") {
    return p;
  }
  return user?.availability ? "ONLINE" : "OFFLINE";
}

export function humanize(value: string): string {
  const text = String(value).replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name?: string): string {
  if (!name?.trim()) {
    return "?";
  }
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
