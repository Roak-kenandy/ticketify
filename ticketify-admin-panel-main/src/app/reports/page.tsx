"use client";

import * as React from "react";
import { toast } from "sonner";
import { BarChart3, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FilterField } from "@/components/app/filter-bar";
import axiosInterceptorInstance, { REPORT_TIMEOUT_MS } from "@/lib/axios-interceptor";
import { downloadFile } from "@/lib/download";
import { cn } from "@/lib/utils";

type Option = { value: string; name: string };
type StageTotals = { total: number; closed_total: number };
type TeamReportRow = { owner_team: string; stages: Record<string, StageTotals> };

const AGING_BUCKETS = [
  { key: "0-1Days", label: "0–1 days", tone: "bg-success" },
  { key: "1-3Days", label: "1–3 days", tone: "bg-info" },
  { key: "3-7Days", label: "3–7 days", tone: "bg-warning" },
  { key: "7+Days", label: "7+ days", tone: "bg-destructive" },
];

function toOptions(content: { id: string; name: string }[] | undefined): Option[] {
  return (content ?? []).map((item) => ({ value: item.id, name: item.name }));
}

export default function TicketAgingPage() {
  const [teams, setTeams] = React.useState<Option[]>([]);
  const [queues, setQueues] = React.useState<Option[]>([]);
  const [team, setTeam] = React.useState("");
  const [queue, setQueue] = React.useState("");
  const [aging, setAging] = React.useState<Record<string, number> | null>(null);
  const [agingLoading, setAgingLoading] = React.useState(false);
  const [agingError, setAgingError] = React.useState(false);
  const [teamReport, setTeamReport] = React.useState<TeamReportRow[]>([]);
  const [teamLoading, setTeamLoading] = React.useState(true);
  const [teamError, setTeamError] = React.useState(false);
  const [downloading, setDownloading] = React.useState<"aging" | "team" | null>(null);

  React.useEffect(() => {
    axiosInterceptorInstance
      .get("/reports/teams")
      .then((response) => setTeams(toOptions(response.data?.content)))
      .catch(() => toast.error("Couldn't load teams"));
    axiosInterceptorInstance
      .get("/reports/queues")
      .then((response) => setQueues(toOptions(response.data?.content)))
      .catch(() => toast.error("Couldn't load queues"));
  }, []);

  const loadTeamReport = React.useCallback(() => {
    setTeamLoading(true);
    setTeamError(false);
    axiosInterceptorInstance
      .get("/reports/tickets/team", { timeout: REPORT_TIMEOUT_MS })
      .then((response) => setTeamReport(response.data ?? []))
      .catch(() => setTeamError(true))
      .finally(() => setTeamLoading(false));
  }, []);

  React.useEffect(() => {
    loadTeamReport();
  }, [loadTeamReport]);

  function loadAging() {
    if (!team || !queue) return;
    setAgingLoading(true);
    setAgingError(false);
    axiosInterceptorInstance
      .get(
        `/reports/tickets/aging?team=${encodeURIComponent(team)}&queue=${encodeURIComponent(queue)}`,
        { timeout: REPORT_TIMEOUT_MS },
      )
      .then((response) => setAging(response.data?.[0] ?? {}))
      .catch(() => setAgingError(true))
      .finally(() => setAgingLoading(false));
  }

  async function download(kind: "aging" | "team") {
    setDownloading(kind);
    try {
      if (kind === "aging") {
        await downloadFile(
          `/reports/tickets/aging/export?team=${encodeURIComponent(team)}&queue=${encodeURIComponent(queue)}`,
          `ticket-aging-${team}-${queue}.csv`,
          "text/csv",
        );
      } else {
        await downloadFile("/reports/tickets/team/export", "tickets-by-team.csv", "text/csv");
      }
      toast.success("CSV downloaded");
    } catch {
      toast.error("Couldn't download the CSV.");
    } finally {
      setDownloading(null);
    }
  }

  const grouped = React.useMemo(() => {
    const map = new Map<string, TeamReportRow[]>();
    for (const row of teamReport) {
      const key = row.owner_team || "Unassigned team";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries());
  }, [teamReport]);

  const totalTickets = aging?.totalTickets ?? 0;

  return (
    <>
      <PageHeader
        title="Ticket aging"
        description="How long open tickets have been waiting, and stage totals per team."
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Aging by queue</CardTitle>
            <CardDescription>Pick a team and queue to see how old its open tickets are.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterField label="Team">
                <Select value={team} onValueChange={setTeam}>
                  <SelectTrigger aria-label="Team">
                    <SelectValue placeholder={teams.length ? "Choose team" : "Loading…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Queue">
                <Select value={queue} onValueChange={setQueue}>
                  <SelectTrigger aria-label="Queue">
                    <SelectValue placeholder={queues.length ? "Choose queue" : "Loading…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={loadAging} disabled={!team || !queue || agingLoading}>
                {agingLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BarChart3 className="h-4 w-4" />
                )}
                Show aging
              </Button>
              <Button
                variant="outline"
                onClick={() => download("aging")}
                disabled={!team || !queue || downloading === "aging"}
              >
                {downloading === "aging" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                CSV
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              {agingError ? (
                <EmptyState
                  compact
                  variant="error"
                  title="Couldn't load aging"
                  action={<Button size="sm" onClick={loadAging}>Try again</Button>}
                />
              ) : agingLoading ? (
                <div className="space-y-4">
                  {AGING_BUCKETS.map((bucket) => (
                    <Skeleton key={bucket.key} className="h-9 w-full" />
                  ))}
                </div>
              ) : !aging ? (
                <EmptyState
                  compact
                  icon={BarChart3}
                  title="No queue selected"
                  description="Choose a team and queue, then select Show aging."
                />
              ) : (
                <div className="space-y-4">
                  {AGING_BUCKETS.map((bucket) => {
                    const count = aging[bucket.key] ?? 0;
                    const percentage = aging[`${bucket.key}Percentage`] ?? 0;
                    return (
                      <div key={bucket.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{bucket.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            <span className="font-semibold text-foreground">{count}</span>
                            {" · "}
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-[width] duration-500", bucket.tone)}
                            style={{ width: `${Math.min(100, percentage)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="text-muted-foreground">Total open tickets</span>
                    <span className="font-semibold tabular-nums">{totalTickets}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Stage totals by team</CardTitle>
              <CardDescription>All service requests, grouped by the team that owns them.</CardDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={loadTeamReport}
                disabled={teamLoading}
                aria-label="Refresh"
              >
                <RefreshCw className={cn("h-4 w-4", teamLoading && "animate-spin")} />
              </Button>
              <Button
                variant="outline"
                onClick={() => download("team")}
                disabled={downloading === "team" || teamReport.length === 0}
              >
                {downloading === "team" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {teamError ? (
              <EmptyState
                variant="error"
                title="Couldn't load the team report"
                action={<Button onClick={loadTeamReport}>Try again</Button>}
              />
            ) : teamLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <EmptyState title="No team data" description="Stage totals appear once tickets exist." />
            ) : (
              grouped.map(([ownerTeam, rows]) => {
                const stages = rows.flatMap((row) => Object.entries(row.stages ?? {}));
                const total = stages.reduce((sum, [, data]) => sum + (data.total ?? 0), 0);
                const closed = stages.reduce((sum, [, data]) => sum + (data.closed_total ?? 0), 0);
                return (
                  <section key={ownerTeam} className="overflow-hidden rounded-lg border">
                    <div className="flex items-center justify-between bg-muted/50 px-3 py-2.5">
                      <h3 className="text-sm font-semibold">{ownerTeam}</h3>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {closed}/{total} closed
                      </span>
                    </div>
                    <Table>
                      <TableHeader className="bg-transparent">
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Stage</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Closed</TableHead>
                          <TableHead className="hidden w-40 sm:table-cell">
                            <span className="sr-only">Progress</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stages.map(([stage, data]) => {
                          const pct = data.total ? (data.closed_total / data.total) * 100 : 0;
                          return (
                            <TableRow key={`${ownerTeam}-${stage}`}>
                              <TableCell>{stage}</TableCell>
                              <TableCell className="text-right tabular-nums">{data.total}</TableCell>
                              <TableCell className="text-right tabular-nums">{data.closed_total}</TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </section>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
