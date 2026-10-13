"use client";

import * as React from "react";
import moment from "moment";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Circle,
  Loader2,
  RadioTower,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField, TableSkeletonRows } from "@/components/app/filter-bar";
import { Pagination, paginate } from "@/components/app/pagination";
import { StatCard } from "@/components/app/stat-card";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { buildQuery } from "@/lib/download";
import { cn } from "@/lib/utils";

type Status = "VALIDATING" | "REGISTERING_ONT" | "APPLYING_CONFIG" | "WAITING_TODO" | "VERIFYING" | "SUCCEEDED" | "FAILED";

type Optical = { online: boolean; rx_dbm: number | null; tx_dbm: number | null; alarms: string[]; result: string };

type Run = {
  id: string;
  crm_ticket_id: string;
  sr_number: string | null;
  action: string;
  action_label: string;
  status: Status;
  status_label: string;
  in_progress: boolean;
  attempts: number;
  failed_stage_label: string | null;
  error_message: string | null;
  submitted: Record<string, unknown>;
  result: Record<string, unknown> | null;
  ont_serial: string | null;
  old_ont_serial: string | null;
  installs_ont: boolean;
  technician: { id: string; name: string };
  started_at: string;
  finished_at: string | null;
  steps: { id: string; attempt: number; stage_label: string; ok: boolean; message: string; created_at: string }[];
};

type Filters = { from: string; to: string; status: string; action: string; sr: string };
const EMPTY: Filters = { from: "", to: "", status: "all", action: "all", sr: "" };

const SIGNAL_LABEL: Record<string, string> = {
  WITHIN_RANGE: "Within range",
  OUTSIDE_RANGE: "Outside range",
  NO_READING: "No reading",
};

function statusBadge(run: Pick<Run, "status" | "in_progress" | "status_label">) {
  if (run.status === "SUCCEEDED") return <Badge variant="success">Successful</Badge>;
  if (run.status === "FAILED") return <Badge variant="destructive">Failed</Badge>;
  return (
    <Badge variant="info">
      <Loader2 className="h-3 w-3 animate-spin" />
      {run.status_label}
    </Badge>
  );
}

function duration(run: Run) {
  const end = run.finished_at ? moment(run.finished_at) : moment();
  const seconds = Math.max(0, end.diff(moment(run.started_at), "seconds"));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function ProvisioningLogPage() {
  const [draft, setDraft] = React.useState<Filters>(EMPTY);
  const [applied, setApplied] = React.useState<Filters>(EMPTY);
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [selected, setSelected] = React.useState<string | null>(null);

  const query = React.useMemo(
    () => buildQuery({ from: applied.from, to: applied.to, status: applied.status, action: applied.action, sr: applied.sr }),
    [applied],
  );

  const load = React.useCallback(
    (quiet = false) => {
      if (!quiet) setLoading(true);
      setError(false);
      return axiosInterceptorInstance
        .get<Run[]>(`/provisioning/transactions${query}`)
        .then((response) => setRuns(response.data ?? []))
        .catch(() => !quiet && setError(true))
        .finally(() => setLoading(false));
    },
    [query],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  const anyRunning = runs.some((run) => run.in_progress);
  React.useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [anyRunning, load]);

  function apply() {
    if (draft.from && draft.to && draft.from > draft.to) {
      toast.error("The from date must be before the to date.");
      return;
    }
    setPage(1);
    setApplied({ ...draft, sr: draft.sr.trim() });
  }

  function clear() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  const filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);
  const counts = {
    total: runs.length,
    succeeded: runs.filter((run) => run.status === "SUCCEEDED").length,
    failed: runs.filter((run) => run.status === "FAILED").length,
    running: runs.filter((run) => run.in_progress).length,
  };
  const { pageCount, current, pageRows, rangeStart, rangeEnd } = paginate(runs, page, pageSize);

  return (
    <>
      <PageHeader
        title="Provisioning log"
        description="Every INCA action started from a ticket, with each stage, retry and result. Passwords are never stored."
        actions={
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Runs" value={counts.total} icon={RadioTower} loading={loading} />
        <StatCard label="Successful" value={counts.succeeded} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard
          label="Failed"
          value={counts.failed}
          icon={XCircle}
          tone={counts.failed ? "danger" : "neutral"}
          hint="Latest attempt failed"
          loading={loading}
        />
        <StatCard label="In progress" value={counts.running} icon={Activity} tone="info" loading={loading} />
      </div>

      <FilterBar onSubmit={apply}>
        <FilterField label="From" htmlFor="prov-from">
          <Input
            id="prov-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
            className="w-40"
          />
        </FilterField>
        <FilterField label="To" htmlFor="prov-to">
          <Input
            id="prov-to"
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
            className="w-40"
          />
        </FilterField>
        <FilterField label="Status">
          <Select value={draft.status} onValueChange={(status) => setDraft((prev) => ({ ...prev, status }))}>
            <SelectTrigger className="w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="SUCCEEDED">Successful</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Action">
          <Select value={draft.action} onValueChange={(action) => setDraft((prev) => ({ ...prev, action }))}>
            <SelectTrigger className="w-44" aria-label="Action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="NEW_CONNECTION">New connection</SelectItem>
              <SelectItem value="ONT_REPLACEMENT">ONT replacement</SelectItem>
              <SelectItem value="RELOCATION">Relocation</SelectItem>
              <SelectItem value="SIGNAL_CHECK">Signal check</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="SR ID or ONT serial" htmlFor="prov-sr" className="min-w-[200px] flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="prov-sr"
              value={draft.sr}
              onChange={(e) => setDraft((prev) => ({ ...prev, sr: e.target.value }))}
              placeholder="e.g. S41374"
              className="pl-9"
            />
          </div>
        </FilterField>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4" />
            Apply
          </Button>
          {filtered && (
            <Button type="button" variant="ghost" onClick={clear}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </FilterBar>

      <Card className="overflow-hidden">
        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load the provisioning log"
            description="The provisioning service didn't respond."
            action={<Button onClick={() => load()}>Try again</Button>}
          />
        ) : !loading && runs.length === 0 ? (
          <EmptyState
            variant={filtered ? "no-results" : "empty"}
            title={filtered ? "No runs match these filters" : "No provisioning runs yet"}
            description={
              filtered
                ? "Widen the date range or clear some filters."
                : "Runs appear here when a technician provisions or checks a signal from a ticket."
            }
          />
        ) : (
          <>
            <Table containerClassName="max-h-[calc(100dvh-460px)] min-h-[320px]">
              <TableHeader sticky>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Started</TableHead>
                  <TableHead>SR</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Technician</TableHead>
                  <TableHead>ONT serial</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeletonRows columns={9} rows={8} />
                ) : (
                  pageRows.map((run) => (
                    <TableRow key={run.id} className="cursor-pointer" onClick={() => setSelected(run.id)}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {moment(run.started_at).format("DD MMM YYYY, HH:mm")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums">{run.sr_number ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{run.action_label}</TableCell>
                      <TableCell>{statusBadge(run)}</TableCell>
                      <TableCell className="whitespace-nowrap">{run.technician.name}</TableCell>
                      <TableCell className="font-mono text-xs">{run.ont_serial ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{run.attempts}</TableCell>
                      <TableCell className="max-w-[280px]">
                        {run.status === "FAILED" ? (
                          <div className="truncate text-sm" title={run.error_message ?? undefined}>
                            <span className="font-medium">{run.failed_stage_label}:</span>{" "}
                            <span className="text-muted-foreground">{run.error_message}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {duration(run)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Pagination
              total={runs.length}
              page={current}
              pageCount={pageCount}
              pageSize={pageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              noun="runs"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      <RunDialog id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function RunDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [run, setRun] = React.useState<Run | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setRun(null);
    setFailed(false);
    if (!id) return;
    let cancelled = false;
    const fetchRun = () =>
      axiosInterceptorInstance
        .get<Run>(`/provisioning/transactions/${id}`)
        .then((response) => !cancelled && setRun(response.data))
        .catch(() => !cancelled && setFailed(true));
    fetchRun();
    const timer = setInterval(fetchRun, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  const result = run?.result ?? null;
  const optical = (result?.optical ?? result?.after ?? result?.before ?? null) as Optical | null;
  const facts: [string, React.ReactNode][] = run
    ? [
        ["Terminal Node", (result?.terminal_node_id as string) ?? "—"],
        ["ONT serial", run.ont_serial ?? "—"],
        ["Old ONT (recovered)", run.old_ont_serial ?? "—"],
        ["OLT / PON", result?.olt_id ? `${result.olt_id} · ${result.pon}` : "—"],
        ["Package", (result?.package as string) ?? (run.submitted.package as string) ?? "—"],
        ["PPPoE", result?.pppoe_username ? `${result.pppoe_username} · verified` : "—"],
        [
          "Optical (Rx)",
          optical?.rx_dbm != null ? `${optical.rx_dbm} dBm · ${SIGNAL_LABEL[optical.result] ?? optical.result}` : "—",
        ],
        ["Action taken", (result?.action_taken as string) ?? "—"],
      ]
    : [];

  const attempts = run ? Array.from(new Set(run.steps.map((step) => step.attempt))) : [];

  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {run ? `${run.action_label} · ${run.sr_number ?? run.crm_ticket_id}` : "Provisioning run"}
            {run && statusBadge(run)}
          </DialogTitle>
          <DialogDescription>
            {run
              ? `Started ${moment(run.started_at).format("DD MMM YYYY, HH:mm:ss")} by ${run.technician.name} · ${run.attempts} attempt${run.attempts === 1 ? "" : "s"}`
              : failed
                ? "Couldn't load this run."
                : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {run && (
          <div className="space-y-5">
            {run.status === "FAILED" && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                <p className="font-medium text-destructive">Failed at {run.failed_stage_label}</p>
                <p className="mt-0.5 text-muted-foreground">{run.error_message}</p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-4 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="truncate font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-4">
              {attempts.map((attempt) => (
                <div key={attempt}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Attempt {attempt}
                  </p>
                  <ol className="space-y-2 border-l pl-4">
                    {run.steps
                      .filter((step) => step.attempt === attempt)
                      .map((step) => (
                        <li key={step.id} className="relative text-sm">
                          <span className="absolute -left-[23px] top-0.5 bg-background">
                            {step.ok ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </span>
                          <span className="font-medium">{step.stage_label}</span>
                          <span className="text-muted-foreground"> · {step.message}</span>
                          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                            {moment(step.created_at).format("HH:mm:ss")}
                          </span>
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
              {run.in_progress && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Circle className="h-3 w-3 animate-pulse fill-current text-info" />
                  {run.status_label}…
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
