"use client";

import { CalendarClock, Clock, PhoneOff, Wallet, type LucideIcon } from "lucide-react";
import React from "react";
import { apiGet } from "@/lib/field/api";
import colors from "@/lib/field/colors";
import { useSession } from "@/lib/field/session";

export type StatusBucket = "pending" | "no_response" | "payment_pending" | "rescheduled";

export type StatusInfo = {
  scheduled_at?: string;
  schedule_count?: number;
  payment?: { reference: string; amount_mvr: number; created_at: string };
  no_response_since?: number | null;
};

export type StatusBoard = {
  scope: "mine" | "all";
  generated_at: string;
  counts: Record<StatusBucket, number>;
  no_response_available: boolean;
  failed_teams?: string[];
  tickets: Record<StatusBucket, Array<Record<string, any> & { status_info?: StatusInfo }>>;
};

export const STATUS_BUCKETS: Array<{
  key: StatusBucket;
  label: string;
  hint: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  empty: string;
}> = [
  {
    key: "pending",
    label: "Pending",
    hint: "Open: assigned or in progress",
    icon: Clock,
    color: colors.info,
    bg: colors.infoBg,
    empty: "No open tickets.",
  },
  {
    key: "no_response",
    label: "No response",
    hint: "Customer not reachable",
    icon: PhoneOff,
    color: colors.error,
    bg: colors.errorBg,
    empty: "No tickets are waiting on an unreachable customer.",
  },
  {
    key: "payment_pending",
    label: "Payment pending",
    hint: "Payment link not paid yet",
    icon: Wallet,
    color: colors.warning,
    bg: colors.warningBg,
    empty: "No open tickets are waiting for payment.",
  },
  {
    key: "rescheduled",
    label: "Rescheduled",
    hint: "Visit moved to a new time",
    icon: CalendarClock,
    color: "#7C3AED",
    bg: "#EDE9FE",
    empty: "No open tickets have had their visit moved.",
  },
];

export function isStatusBucket(value: unknown): value is StatusBucket {
  return STATUS_BUCKETS.some((bucket) => bucket.key === value);
}

const POLL_MS = 60_000;

/** Build Pending counts from the tickets already loaded for Ooredoo (no CRM board). */
export function boardFromTickets(tickets: Array<Record<string, any>>): StatusBoard {
  const pending = tickets.filter((t) => t.state !== "CLOSED");
  return {
    scope: "mine",
    generated_at: new Date().toISOString(),
    counts: {
      pending: pending.length,
      no_response: 0,
      payment_pending: 0,
      rescheduled: 0,
    },
    no_response_available: false,
    tickets: {
      pending,
      no_response: [],
      payment_pending: [],
      rescheduled: [],
    },
  };
}

export function useStatusBoard() {
  const { token, user } = useSession();
  const [board, setBoard] = React.useState<StatusBoard | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inflight = React.useRef<Promise<void> | null>(null);
  // Ooredoo dashboard derives the board from /tickets — skip CRM status-board polls.
  const skipRemote = user?.source === "OOREDOO";

  const load = React.useCallback(async () => {
    if (!token || skipRemote) {
      return;
    }
    if (inflight.current) {
      return inflight.current;
    }
    const run = (async () => {
      try {
        const data: StatusBoard = await apiGet("/tickets/status-board", token, { silent: true });
        setBoard(data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || "Could not load ticket status");
      }
    })();
    inflight.current = run.finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, [token, skipRemote]);

  React.useEffect(() => {
    if (skipRemote) {
      setBoard(null);
      setError(null);
      return;
    }
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, skipRemote]);

  return { board, error, reload: load };
}
