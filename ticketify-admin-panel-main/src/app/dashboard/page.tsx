"use client";

import * as React from "react";
import Link from "next/link";
import moment from "moment";
import { AlertTriangle, CalendarClock, Clock, PhoneOff, RefreshCw, Wallet, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard, type StatTone } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { TableSkeletonRows } from "@/components/app/filter-bar";
import { Pagination, paginate } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import { formatMvr } from "@/lib/format";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

type Bucket = "pending" | "no_response" | "payment_pending" | "rescheduled";

type StatusInfo = {
  scheduled_at?: string;
  schedule_count?: number;
  payment?: { reference: string; amount_mvr: number; created_at: string };
  no_response_since?: number | null;
};

type BoardTicket = {
  id: string;
  number?: string;
  state?: string;
  queue?: { name?: string };
  stage?: { name?: string };
  contact?: { name?: string };
  assigned_to?: { user?: { name?: string } | null; team?: { name?: string } | null };
  creation_date?: number;
  status_info?: StatusInfo;
};

type Board = {
  scope: "mine" | "all";
  generated_at: string;
  counts: Record<Bucket, number>;
  no_response_available: boolean;
  failed_teams?: string[];
  tickets: Record<Bucket, BoardTicket[]>;
};

const BUCKETS: { key: Bucket; label: string; hint: string; icon: LucideIcon; tone: StatTone; empty: string }[] = [
  {
    key: "pending",
    label: "Pending",
    hint: "Open: assigned or in progress",
    icon: Clock,
    tone: "info",
    empty: "There are no open tickets.",
  },
  {
    key: "no_response",
    label: "No response",
    hint: "Customer not reachable",
    icon: PhoneOff,
    tone: "danger",
    empty: "No tickets are waiting on an unreachable customer.",
  },
  {
    key: "payment_pending",
    label: "Payment pending",
    hint: "Payment link not paid yet",
    icon: Wallet,
    tone: "warning",
    empty: "No open tickets are waiting for payment.",
  },
  {
    key: "rescheduled",
    label: "Rescheduled",
    hint: "Visit moved to a new time",
    icon: CalendarClock,
    tone: "brand",
    empty: "No open tickets have had their visit moved.",
  },
];

function statusDetail(bucket: Bucket, info?: StatusInfo): string {
  if (bucket === "no_response") {
    return info?.no_response_since
      ? `Since ${moment(info.no_response_since * 1000).format("DD MMM, h:mm A")}`
      : "Customer not reachable";
  }
  if (bucket === "payment_pending" && info?.payment) {
    return `${formatMvr(info.payment.amount_mvr)} · link sent ${moment(info.payment.created_at).fromNow()}`;
  }
  if (bucket === "rescheduled" && info?.scheduled_at) {
    return `Moved ${info.schedule_count ?? 2}× · now ${moment(info.scheduled_at).format("DD MMM, h:mm A")}`;
  }
  return "";
}

export default function StatusDashboardPage() {
  const [board, setBoard] = React.useState<Board | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<Bucket>("pending");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const inflight = React.useRef(false);

  const load = React.useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    try {
      const response = await axiosInterceptorInstance.get<Board>("/tickets/status-board");
      setBoard(response.data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load the ticket status."));
    } finally {
      inflight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const active = BUCKETS.find((bucket) => bucket.key === view) ?? BUCKETS[0];
  const rows = board?.tickets[view] ?? [];
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(rows, page, pageSize);
  const showStatus = (next: Bucket) => {
    setView(next);
    setPage(1);
  };
  const total = board?.counts[view] ?? 0;
  const showDetail = view !== "pending";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Open tickets across all teams by status."
        actions={
          <>
            {board && (
              <span className="text-xs text-muted-foreground">
                Updated {moment(board.generated_at).format("h:mm A")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      />

      {(error && board) || board?.failed_teams?.length || (board && !board.no_response_available) ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            {error && board ? <p>{error} Showing the last loaded data.</p> : null}
            {board?.failed_teams?.length ? (
              <p>Could not load tickets for {board.failed_teams.join(", ")}. Counts may be low.</p>
            ) : null}
            {board && !board.no_response_available ? (
              <p>The CRM did not return No response activities, so that count is unavailable.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error && !board && !loading ? (
        <Card>
          <EmptyState
            variant="error"
            title="Couldn't load the dashboard"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {BUCKETS.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                onClick={() => showStatus(bucket.key)}
                className={cn(
                  "rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                  view === bucket.key && "ring-2 ring-primary/60",
                )}
                aria-pressed={view === bucket.key}
              >
                <StatCard
                  label={bucket.label}
                  value={
                    bucket.key === "no_response" && board && !board.no_response_available
                      ? "–"
                      : (board?.counts[bucket.key] ?? 0)
                  }
                  icon={bucket.icon}
                  tone={bucket.tone}
                  hint={bucket.hint}
                  loading={loading}
                  className="h-full"
                />
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b py-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <active.icon className="h-4 w-4 text-muted-foreground" />
                {active.label} tickets
                {board ? <Badge variant="secondary">{total}</Badge> : null}
              </h2>
              {total > rows.length ? (
                <span className="text-xs text-muted-foreground">
                  Showing the newest {rows.length} of {total}
                </span>
              ) : null}
            </CardHeader>
            {!loading && rows.length === 0 ? (
              <EmptyState icon={active.icon} title={`No ${active.label.toLowerCase()} tickets`} description={active.empty} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Queue / stage</TableHead>
                    <TableHead>Technician</TableHead>
                    {showDetail ? <TableHead>{active.label}</TableHead> : <TableHead>Created</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableSkeletonRows columns={5} />
                  ) : (
                    pageRows.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/field/tickets/${encodeURIComponent(ticket.id)}`}
                            className="font-medium text-primary hover:underline"
                          >
                            #{ticket.number ?? ticket.id.slice(0, 8)}
                          </Link>
                          <div className="mt-1">
                            <Badge variant={ticket.state === "IN_PROGRESS" ? "info" : "secondary"}>
                              {ticket.state === "IN_PROGRESS" ? "In progress" : "New"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">{ticket.contact?.name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="text-sm">{ticket.queue?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{ticket.stage?.name ?? ""}</div>
                        </TableCell>
                        <TableCell>
                          {ticket.assigned_to?.user?.name ?? (
                            <span className="text-muted-foreground">
                              Unassigned{ticket.assigned_to?.team?.name ? ` · ${ticket.assigned_to.team.name}` : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {showDetail
                            ? statusDetail(view, ticket.status_info)
                            : ticket.creation_date
                              ? moment(ticket.creation_date * 1000).format("DD MMM YYYY")
                              : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
            {!loading && rows.length > 0 ? (
              <Pagination
                total={rows.length}
                page={current}
                pageCount={pageCount}
                pageSize={pageSize}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                noun="tickets"
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            ) : null}
          </Card>
        </div>
      )}
    </>
  );
}
