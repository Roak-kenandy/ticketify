"use client";

import React from "react";
import Link from "next/link";
import moment from "moment";
import {
  AlertTriangle,
  ClipboardList,
  Inbox,
  Maximize2,
  Minimize2,
  PlayCircle,
  RefreshCw,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const REFRESH_MS = 30_000;

type Kind = { label: string; count: number };
type Region = {
  label?: string;
  unassigned_new?: number;
  assigned_new?: number;
  in_progress?: number;
  breakdown?: { unassigned?: Kind[]; assigned?: Kind[]; in_progress?: Kind[] };
};
type Snapshot = {
  generated_at?: string;
  auto_assign_enabled?: boolean;
  regions?: { male?: Region; hulhumale?: Region; transport_lm?: Region };
  technicians?: {
    online?: number;
    busy?: number;
    offline?: number;
    total?: number;
    auto_assign_eligible?: number;
  };
};

const REGION_ORDER: { key: keyof NonNullable<Snapshot["regions"]>; fallback: string }[] = [
  { key: "male", fallback: "Malé Access" },
  { key: "hulhumale", fallback: "Hulhumalé Access" },
  { key: "transport_lm", fallback: "Transport · Last Mile" },
];

export default function OperationsBoardPage() {
  const [data, setData] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const now = useTicker(15_000);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(boardRef);
  const inflight = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    try {
      const response = await axiosInterceptorInstance.get<Snapshot>("/dashboard/operations");
      setData(response.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't load the operations data."));
    } finally {
      inflight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const regions = REGION_ORDER.map(({ key, fallback }) => {
    const region = data?.regions?.[key];
    return region ? { key, title: region.label ?? fallback, region } : null;
  }).filter((item): item is { key: typeof REGION_ORDER[number]["key"]; title: string; region: Region } =>
    Boolean(item),
  );

  const totals = regions.reduce(
    (sum, { region }) => ({
      unassigned: sum.unassigned + (region.unassigned_new ?? 0),
      assigned: sum.assigned + (region.assigned_new ?? 0),
      inProgress: sum.inProgress + (region.in_progress ?? 0),
    }),
    { unassigned: 0, assigned: 0, inProgress: 0 },
  );
  const tech = data?.technicians;
  const techTotal = tech?.total ?? (tech?.online ?? 0) + (tech?.busy ?? 0) + (tech?.offline ?? 0);
  const stale = Boolean(error && data);

  return (
    <div
      ref={boardRef}
      className={cn(isFullscreen && "scrollbar-thin overflow-y-auto bg-background p-6 lg:p-10")}
    >
      <PageHeader
        title="Operations board"
        description="Open tickets by region and status, with the field team's availability."
        actions={
          <>
            <LiveStatus lastUpdated={lastUpdated} now={now} error={Boolean(error)} />
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
              title={isFullscreen ? "Exit full screen" : "Show on a TV or big screen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Full screen"}</span>
            </Button>
          </>
        }
      />

      {stale && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <span className="flex-1">
            {error} Showing data from {lastUpdated ? moment(lastUpdated).format("h:mm A") : "earlier"}.
          </span>
          <Button size="sm" variant="ghost" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {error && !data && !loading ? (
        <Card>
          <EmptyState
            variant="error"
            title="Couldn't load the operations board"
            description={error}
            action={
              <Button variant="outline" size="sm" onClick={refresh}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Waiting for assignment"
              value={totals.unassigned}
              icon={Inbox}
              tone={totals.unassigned > 0 ? "warning" : "success"}
              hint={totals.unassigned > 0 ? "New tickets with no technician" : "Every new ticket has an owner"}
              loading={loading}
            />
            <StatCard
              label="Assigned, not started"
              value={totals.assigned}
              icon={ClipboardList}
              tone="info"
              hint="New tickets with a technician"
              loading={loading}
            />
            <StatCard
              label="In progress"
              value={totals.inProgress}
              icon={PlayCircle}
              tone="brand"
              hint="Being worked on now"
              loading={loading}
            />
            <StatCard
              label="Technicians available"
              value={
                <>
                  {tech?.online ?? 0}
                  <span className="text-base font-normal text-muted-foreground"> / {techTotal}</span>
                </>
              }
              icon={Users}
              tone="success"
              hint={`${tech?.busy ?? 0} busy · ${tech?.offline ?? 0} offline`}
              loading={loading}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section aria-label="Regions" className="space-y-6">
              {loading
                ? [0, 1, 2].map((i) => <RegionSkeleton key={i} />)
                : regions.map(({ key, title, region }) => (
                    <RegionCard key={key} title={title} region={region} />
                  ))}
            </section>

            <aside className="space-y-6">
              <TeamCard loading={loading} tech={tech} total={techTotal} />
              <AutoAssignCard loading={loading} enabled={data?.auto_assign_enabled} />
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveStatus({ lastUpdated, now, error }: { lastUpdated: Date | null; now: Date; error: boolean }) {
  return (
    <span className="mr-1 inline-flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className="relative flex h-2 w-2" aria-hidden>
        {!error && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", error ? "bg-destructive" : "bg-success")} />
      </span>
      {lastUpdated ? `Updated ${moment(lastUpdated).from(now)}` : "Connecting…"}
    </span>
  );
}

const KIND_STYLES: { match: RegExp; dot: string; bar: string }[] = [
  { match: /fault/i, dot: "bg-rose-500", bar: "bg-rose-500/80" },
  { match: /new\s*connection/i, dot: "bg-sky-500", bar: "bg-sky-500/80" },
  { match: /reloc/i, dot: "bg-violet-500", bar: "bg-violet-500/80" },
  { match: /inquir/i, dot: "bg-amber-500", bar: "bg-amber-500/80" },
];
const KIND_FALLBACK = { dot: "bg-slate-400", bar: "bg-slate-400/80" };

function kindStyle(label: string) {
  return KIND_STYLES.find((style) => style.match.test(label)) ?? KIND_FALLBACK;
}

function kindRank(label: string) {
  const index = KIND_STYLES.findIndex((style) => style.match.test(label));
  return index === -1 ? KIND_STYLES.length : index;
}

function RegionCard({ title, region }: { title: string; region: Region }) {
  const unassigned = region.unassigned_new ?? 0;
  const assigned = region.assigned_new ?? 0;
  const inProgress = region.in_progress ?? 0;
  const open = unassigned + assigned + inProgress;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {open} open ticket{open === 1 ? "" : "s"}
          </p>
        </div>
        {unassigned > 0 ? (
          <Badge variant="warning" dot>
            {unassigned} waiting for assignment
          </Badge>
        ) : (
          <Badge variant="success" dot>
            All assigned
          </Badge>
        )}
      </div>
      <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        <StatusColumn label="Waiting for assignment" total={unassigned} kinds={region.breakdown?.unassigned} emphasis={unassigned > 0} />
        <StatusColumn label="Assigned, not started" total={assigned} kinds={region.breakdown?.assigned} />
        <StatusColumn label="In progress" total={inProgress} kinds={region.breakdown?.in_progress} />
      </div>
    </Card>
  );
}

function StatusColumn({
  label,
  total,
  kinds,
  emphasis,
}: {
  label: string;
  total: number;
  kinds?: Kind[];
  emphasis?: boolean;
}) {
  const rows = (kinds ?? [])
    .filter((item) => item.count > 0)
    .sort((a, b) => kindRank(a.label) - kindRank(b.label) || b.count - a.count);

  return (
    <div className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-3xl font-semibold tabular-nums leading-none",
            emphasis ? "text-[hsl(32_90%_40%)] dark:text-warning" : "text-foreground",
          )}
        >
          {total}
        </p>
      </div>
      {rows.length ? (
        <ul className="mt-4 space-y-2.5">
          {rows.map((item) => {
            const style = kindStyle(item.label);
            const share = total ? Math.max(4, Math.round((item.count / total) * 100)) : 0;
            return (
              <li key={item.label}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">{item.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No tickets</p>
      )}
    </div>
  );
}

function TeamCard({
  loading,
  tech,
  total,
}: {
  loading: boolean;
  tech: Snapshot["technicians"];
  total: number;
}) {
  const segments = [
    { label: "Available", value: tech?.online ?? 0, dot: "bg-emerald-500" },
    { label: "Busy", value: tech?.busy ?? 0, dot: "bg-amber-500" },
    { label: "Offline", value: tech?.offline ?? 0, dot: "bg-slate-400" },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Field team</h2>
        <Link href="/" className="text-xs font-medium text-primary hover:underline">
          Open live map
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">No technicians registered yet.</p>
      ) : (
        <>
          <div
            className="flex h-2.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}
          >
            {segments.map((segment) =>
              segment.value ? (
                <div
                  key={segment.label}
                  className={segment.dot}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-4 space-y-2.5">
            {segments.map((segment) => (
              <li key={segment.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", segment.dot)} aria-hidden />
                  {segment.label}
                </span>
                <span className="font-medium tabular-nums">{segment.value}</span>
              </li>
            ))}
          </ul>
          {tech?.auto_assign_eligible !== undefined && (
            <p className="mt-4 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5" />
              {tech.auto_assign_eligible} eligible for auto-assign
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function AutoAssignCard({ loading, enabled }: { loading: boolean; enabled?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Auto-assign</p>
          {loading ? (
            <Skeleton className="mt-1 h-3.5 w-24" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {enabled ? "On: new tickets are assigned automatically" : "Off: tickets wait for manual dispatch"}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function RegionSkeleton() {
  return (
    <Card className="overflow-hidden" aria-busy="true">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function useTicker(intervalMs: number) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function useFullscreen(ref: React.RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  React.useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);
  const toggle = React.useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      ref.current?.requestFullscreen?.().catch(() => undefined);
    }
  }, [ref]);
  return { isFullscreen, toggle };
}
