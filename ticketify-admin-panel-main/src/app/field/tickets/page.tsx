"use client";

import { CheckCheck, Mail, RefreshCw, Wrench, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import TicketCard from "@/components/field/ticket-card";
import { EmptyState, ErrorState, InlineBanner, TicketCardSkeleton } from "@/components/field/ui/state-views";
import { cn } from "@/lib/field/cn";
import { fieldCardGrid, fieldContainer } from "@/lib/field/layout";
import { showError } from "@/lib/field/notify";
import { useTickets } from "@/lib/field/tickets";

type TabKey = "NEW" | "IN_PROGRESS" | "CLOSED";

const TABS: Array<{
  key: TabKey;
  title: string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyMessage: string;
}> = [
  {
    key: "NEW",
    title: "Assigned",
    emptyIcon: Mail,
    emptyTitle: "Nothing assigned",
    emptyMessage: "Tickets you pick up or are given will appear here.",
  },
  {
    key: "IN_PROGRESS",
    title: "Active",
    emptyIcon: Wrench,
    emptyTitle: "No active work",
    emptyMessage: "Start an assigned ticket to see it here.",
  },
  {
    key: "CLOSED",
    title: "Closed",
    emptyIcon: CheckCheck,
    emptyTitle: "No closed tickets",
    emptyMessage: "Your 50 most recent closed tickets are shown here.",
  },
];

function MyTickets() {
  const router = useRouter();
  const params = useSearchParams();
  const { tickets, syncedAt, error, refresh } = useTickets();
  const [refreshing, setRefreshing] = React.useState(false);
  const requested = params.get("tab");
  const active: TabKey = TABS.some((tab) => tab.key === requested) ? (requested as TabKey) : "NEW";
  const loaded = syncedAt != null;

  const groups = React.useMemo(
    () => ({
      NEW: tickets.filter((t) => t.state === "NEW"),
      IN_PROGRESS: tickets.filter((t) => t.state === "IN_PROGRESS"),
      CLOSED: tickets.filter((t) => t.state === "CLOSED"),
    }),
    [tickets],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh({ force: true });
    } catch (err: any) {
      showError(err?.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const tab = TABS.find((t) => t.key === active) ?? TABS[0];
  const list = groups[active];

  return (
    <>
      <ScreenHeader title="My tickets" subtitle="Tap refresh to sync with the CRM" wide>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 rounded-md bg-white p-1 sm:max-w-md" role="tablist">
              {TABS.map((item) => {
                const on = item.key === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => router.replace(`/field/tickets?tab=${item.key}`, { scroll: false })}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-[9px] px-1 py-2 text-xs font-bold min-[360px]:text-[13px]",
                      on ? "bg-tertiary text-primary" : "text-gray2",
                    )}
                  >
                    {loaded ? `${item.title} (${groups[item.key].length})` : item.title}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh"
              className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/15 text-white disabled:opacity-60"
            >
              <RefreshCw className={refreshing ? "h-5 w-5 animate-spin" : "h-5 w-5"} />
            </button>
          </div>
      </ScreenHeader>
      <main className={cn(fieldContainer.wide, "flex flex-col gap-2 p-4 pb-16")}>
        {loaded && error ? (
          <div className="mb-2">
            <InlineBanner tone="error" message={error} actionLabel="Retry" onAction={onRefresh} />
          </div>
        ) : null}
        {list.length ? (
          <div className={fieldCardGrid}>
            {list.map((ticket, index) => (
              <TicketCard key={String(ticket?.id ?? index)} ticket={ticket} hideState />
            ))}
          </div>
        ) : !loaded && !error ? (
          <div className={fieldCardGrid}>
            <TicketCardSkeleton />
            <TicketCardSkeleton />
          </div>
        ) : !loaded && error ? (
          <ErrorState message={error} onRetry={onRefresh} />
        ) : (
          <EmptyState icon={tab.emptyIcon} title={tab.emptyTitle} message={tab.emptyMessage} />
        )}
      </main>
    </>
  );
}

export default function MyTicketsPage() {
  return (
    <Suspense>
      <MyTickets />
    </Suspense>
  );
}
