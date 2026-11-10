"use client";

import { CheckCheck, RefreshCw } from "lucide-react";
import moment from "moment";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import TicketCard from "@/components/field/ticket-card";
import { EmptyState, ErrorState, InlineBanner, TicketCardSkeleton } from "@/components/field/ui/state-views";
import { cn } from "@/lib/field/cn";
import { fieldCardGrid, fieldContainer } from "@/lib/field/layout";
import {
  isStatusBucket,
  STATUS_BUCKETS,
  type StatusBucket,
  type StatusInfo,
  useStatusBoard,
} from "@/lib/field/status-board";

function detail(bucket: StatusBucket, info: StatusInfo | undefined, ticket: any, showAssignee: boolean) {
  const parts: string[] = [];
  if (bucket === "no_response") {
    parts.push(
      info?.no_response_since
        ? `No response since ${moment(info.no_response_since * 1000).format("DD MMM, h:mm A")}`
        : "Customer not reachable",
    );
  } else if (bucket === "payment_pending" && info?.payment) {
    parts.push(
      `MVR ${info.payment.amount_mvr.toFixed(2)} unpaid · link sent ${moment(info.payment.created_at).fromNow()}`,
    );
  } else if (bucket === "rescheduled" && info?.scheduled_at) {
    parts.push(
      `Visit moved ${info.schedule_count ?? 2}× · now ${moment(info.scheduled_at).format("DD MMM, h:mm A")}`,
    );
  }
  if (showAssignee) {
    parts.push(ticket?.assigned_to?.user?.name ? `Technician: ${ticket.assigned_to.user.name}` : "Unassigned");
  }
  return parts;
}

function StatusList() {
  const router = useRouter();
  const params = useSearchParams();
  const { board, error, reload } = useStatusBoard();
  const [refreshing, setRefreshing] = React.useState(false);
  const requested = params.get("bucket");
  const active: StatusBucket = isStatusBucket(requested) ? requested : "pending";
  const meta = STATUS_BUCKETS.find((bucket) => bucket.key === active) ?? STATUS_BUCKETS[0];
  const list = board?.tickets[active] ?? [];
  const total = board?.counts[active] ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <ScreenHeader
        title="Ticket status"
        subtitle={board ? (board.scope === "all" ? "Open tickets across all teams" : "Your open tickets") : undefined}
        wide
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-md bg-white p-1" role="tablist">
            {STATUS_BUCKETS.map((bucket) => {
              const on = bucket.key === active;
              return (
                <button
                  key={bucket.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => router.replace(`/field/status?bucket=${bucket.key}`, { scroll: false })}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-[9px] px-2.5 py-2 text-xs font-bold min-[360px]:text-[13px]",
                    on ? "bg-tertiary text-primary" : "text-gray2",
                  )}
                >
                  {board ? `${bucket.label} (${board.counts[bucket.key]})` : bucket.label}
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
        <p className="text-[13px] text-gray2">
          {meta.hint}
          {board ? ` · updated ${moment(board.generated_at).format("h:mm A")}` : ""}
        </p>
        {board && error ? <InlineBanner tone="error" message={error} actionLabel="Retry" onAction={onRefresh} /> : null}
        {active === "no_response" && board && !board.no_response_available ? (
          <InlineBanner tone="error" message="The CRM did not return No response activities. Try again shortly." />
        ) : null}
        {board?.failed_teams?.length ? (
          <InlineBanner
            tone="error"
            message={`Could not load tickets for ${board.failed_teams.join(", ")}. Counts may be low.`}
          />
        ) : null}
        {total > list.length ? (
          <InlineBanner message={`Showing the newest ${list.length} of ${total} tickets.`} />
        ) : null}
        {list.length ? (
          <div className={fieldCardGrid}>
            {list.map((ticket, index) => {
              const lines = detail(active, ticket.status_info, ticket, board?.scope === "all");
              return (
                <TicketCard
                  key={String(ticket?.id ?? index)}
                  ticket={ticket}
                  footer={
                    lines.length ? (
                      <div
                        className="flex flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-xs font-semibold"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        {lines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </div>
        ) : !board && !error ? (
          <div className={fieldCardGrid}>
            <TicketCardSkeleton />
            <TicketCardSkeleton />
          </div>
        ) : !board && error ? (
          <ErrorState message={error} onRetry={onRefresh} />
        ) : (
          <EmptyState icon={CheckCheck} title={`No ${meta.label.toLowerCase()} tickets`} message={meta.empty} />
        )}
      </main>
    </>
  );
}

export default function StatusPage() {
  return (
    <Suspense>
      <StatusList />
    </Suspense>
  );
}
