"use client";

import * as React from "react";
import Link from "next/link";
import moment from "moment";
import { Clock, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { TableSkeletonRows } from "@/components/app/filter-bar";
import { Pagination, paginate } from "@/components/app/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;
const ALL_TECHS = "all";
const TECH_KEY = "ticketify.dashboard.ooredoo.technician";

type TechOption = { id: string; name: string; count?: number };

type BoardTicket = {
  id: string;
  number?: string;
  state?: string;
  queue?: { name?: string };
  stage?: { name?: string };
  contact?: { name?: string };
  assigned_to?: { user?: { name?: string } | null };
  creation_date?: number;
};

type Board = {
  generated_at: string;
  count: number;
  technician?: string | null;
  technicians?: TechOption[];
  tickets: BoardTicket[];
  source?: "OOREDOO";
};

function savedTech(): TechOption | null {
  try {
    const value = JSON.parse(localStorage.getItem(TECH_KEY) ?? "null");
    return value && typeof value.id === "string" && typeof value.name === "string" ? value : null;
  } catch {
    return null;
  }
}

export default function OoredooDashboardPage() {
  const [board, setBoard] = React.useState<Board | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [technician, setTechnician] = React.useState<TechOption | null | undefined>(undefined);
  const latest = React.useRef(0);
  const technicianId = technician?.id ?? null;

  React.useEffect(() => setTechnician(savedTech()), []);

  const load = React.useCallback(async () => {
    const request = ++latest.current;
    setRefreshing(true);
    try {
      const response = await axiosInterceptorInstance.get<Board>("/tickets/ooredoo/status-board", {
        params: technicianId ? { technician: technicianId } : undefined,
      });
      if (request !== latest.current) return;
      setBoard(response.data);
      setError(null);
    } catch (err) {
      if (request !== latest.current) return;
      setError(apiErrorMessage(err, "Couldn't load the Ooredoo dashboard."));
    } finally {
      if (request === latest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [technicianId]);

  React.useEffect(() => {
    if (technician === undefined) return;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, technician]);

  const techOptions = React.useMemo(() => {
    const options: TechOption[] = board?.technicians ?? [];
    return technician && !options.some((option) => option.id === technician.id)
      ? [...options, { ...technician, count: 0 }]
      : options;
  }, [board?.technicians, technician]);

  const chooseTech = (value: string) => {
    const next = value === ALL_TECHS ? null : (techOptions.find((option) => option.id === value) ?? null);
    setTechnician(next);
    setPage(1);
    setLoading(true);
    try {
      if (next) localStorage.setItem(TECH_KEY, JSON.stringify({ id: next.id, name: next.name }));
      else localStorage.removeItem(TECH_KEY);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  const rows = board?.tickets ?? [];
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(rows, page, pageSize);
  const total = board?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Ooredoo Dashboard"
        description={
          technician
            ? `Open FMS tickets for ${technician.name}.`
            : "Open FMS tickets for @medianet.com.mv technicians."
        }
        actions={
          <>
            <Select
              value={technician?.id ?? ALL_TECHS}
              onValueChange={chooseTech}
              disabled={technician === undefined}
            >
              <SelectTrigger className="h-9 w-72" aria-label="Filter by technician">
                <SelectValue placeholder="All technicians" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TECHS}>All technicians</SelectItem>
                {techOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                    {option.count !== undefined ? ` (${option.count})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {error && !board && !loading ? (
        <Card>
          <EmptyState
            variant="error"
            title="Couldn't load the Ooredoo dashboard"
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
          {error && board ? (
            <p className="text-sm text-warning">{error} Showing the last loaded data.</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pending"
              value={board?.count ?? 0}
              icon={Clock}
              tone="info"
              hint="Open FMS tickets"
              loading={loading}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b py-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Pending tickets
                {technician ? (
                  <span className="font-normal text-muted-foreground">· {technician.name}</span>
                ) : null}
                {board ? <Badge variant="secondary">{total}</Badge> : null}
              </h2>
              {total > rows.length ? (
                <span className="text-xs text-muted-foreground">
                  Showing the newest {rows.length} of {total}
                </span>
              ) : null}
            </CardHeader>
            {!loading && rows.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No pending tickets"
                description="There are no open FMS tickets for Medianet technicians."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Created</TableHead>
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
                            #{ticket.number ?? ticket.id}
                          </Link>
                          <div className="mt-1">
                            <Badge variant={ticket.state === "IN_PROGRESS" ? "info" : "secondary"}>
                              {ticket.state === "IN_PROGRESS" ? "In progress" : "New"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate">
                          {ticket.contact?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{ticket.queue?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{ticket.stage?.name ?? ""}</div>
                        </TableCell>
                        <TableCell>
                          {ticket.assigned_to?.user?.name ?? (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {ticket.creation_date
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
