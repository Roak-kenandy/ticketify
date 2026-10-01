"use client";

import * as React from "react";
import moment from "moment";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Eye,
  Filter,
  ListOrdered,
  Loader2,
  MapPin,
  Play,
  PlugZap,
  RefreshCw,
  Truck,
  UserCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import axios, { apiErrorMessage } from "@/lib/axios-interceptor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";

type Category = "fault" | "new_connections" | "relocation";
type Mode = "AUTO" | "MANUAL";
type Strategy = "balanced" | "least_busy" | "nearest";
type WaitingReason = "no_eligible_technician" | "all_at_capacity";

type Region = { team_id: string; label: string; enabled: boolean };

type WaitingTicket = {
  ticket_id: string;
  number: string | null;
  category: Category;
  priority: string | null;
  team_id: string;
  reason: WaitingReason;
};

type RunResult = {
  team_id: string;
  assigned: {
    ticket_id: string;
    number: string | null;
    category: Category;
    priority: string | null;
    crm_user_id: string;
    technician_name: string | null;
  }[];
  waiting: WaitingTicket[];
  skipped: { ticket_id: string; number: string | null; reason: string }[];
  manual_count: number;
};

type Settings = {
  enabled: boolean;
  categories: Record<Category, Mode>;
  strategy: Strategy;
  include_busy: boolean;
  max_open_jobs: number;
  regions: Region[];
  last_run_at: string | null;
  last_run_summary: RunResult[] | null;
  pending_alerts: (WaitingTicket & { since: string })[];
};

type SettingsPatch = Partial<{
  enabled: boolean;
  categories: Partial<Record<Category, Mode>>;
  strategy: Strategy;
  include_busy: boolean;
  max_open_jobs: number;
  team_enabled: Record<string, boolean>;
}>;

type Activity = {
  id: string;
  ticket_id: string;
  action: "AUTO_ASSIGN" | "MANUAL_ASSIGN" | "AUTO_ASSIGN_NO_CANDIDATE";
  created_at: string;
  number?: string | null;
  category?: Category | null;
  technician_name?: string | null;
  reason?: WaitingReason;
};

type Overview = {
  team_assignment?: { team_id: string; breakdown?: { unassigned?: { label: string; count: number }[] } }[];
  technicians?: { auto_assign_eligible?: number };
};

const CATEGORIES: { key: Category; label: string; description: string; icon: LucideIcon }[] = [
  {
    key: "fault",
    label: "Fault",
    description: "Service faults and outages reported by customers.",
    icon: Wrench,
  },
  {
    key: "new_connections",
    label: "New Connections",
    description: "Installations for new subscribers.",
    icon: PlugZap,
  },
  {
    key: "relocation",
    label: "Relocation",
    description: "Moving an existing service to a new address.",
    icon: Truck,
  },
];

const CATEGORY_LABEL: Record<Category, string> = {
  fault: "Fault",
  new_connections: "New Connections",
  relocation: "Relocation",
};

const STRATEGIES: { value: Strategy; label: string; description: string }[] = [
  {
    value: "balanced",
    label: "Balanced",
    description: "Weighs current workload and distance to the customer together.",
  },
  {
    value: "least_busy",
    label: "Least busy first",
    description: "Spreads jobs evenly; distance only breaks ties.",
  },
  {
    value: "nearest",
    label: "Nearest first",
    description: "Sends the closest technician; workload only breaks ties.",
  },
];

const REASON_LABEL: Record<WaitingReason, string> = {
  no_eligible_technician: "No technician online",
  all_at_capacity: "Everyone at job limit",
};

const FLOW: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Filter,
    title: "Filter eligible technicians",
    body: "Same team and region, online (green) and permitted. Offline is never used; busy is skipped unless allowed.",
  },
  {
    icon: ListOrdered,
    title: "Rank candidates",
    body: "Highest priority and oldest tickets go first, then workload and proximity decide who gets each one.",
  },
  {
    icon: UserCheck,
    title: "Assign and notify",
    body: "Team and technician are written to CRM and Ticketify, and the technician gets one in-app notification.",
  },
  {
    icon: BellRing,
    title: "Nobody eligible?",
    body: "The ticket stays in the pool and supervisors are alerted once, so it can be dispatched by hand.",
  },
];

function categoryOfQueue(label: string): Category | null {
  const value = label.toLowerCase();
  if (value.includes("fault")) return "fault";
  if (value.includes("new connection")) return "new_connections";
  if (value.includes("relocat")) return "relocation";
  return null;
}

export default function AutoAssignPage() {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [activity, setActivity] = React.useState<Activity[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmOn, setConfirmOn] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [preview, setPreview] = React.useState<RunResult[] | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const load = React.useCallback(async () => {
    const [settingsRes, overviewRes, activityRes] = await Promise.allSettled([
      axios.get<Settings>("/assignments/settings"),
      axios.get<Overview>("/dispatch/overview"),
      axios.get<Activity[]>("/assignments/activity"),
    ]);
    if (settingsRes.status === "fulfilled") {
      setSettings(settingsRes.value.data);
      setLoadError(null);
    } else {
      setLoadError(apiErrorMessage(settingsRes.reason, "Couldn't load auto-assign settings."));
    }
    if (overviewRes.status === "fulfilled") setOverview(overviewRes.value.data);
    if (activityRes.status === "fulfilled") setActivity(activityRes.value.data);
  }, []);

  React.useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const save = React.useCallback(
    async (patch: SettingsPatch, optimistic: (current: Settings) => Settings, success?: string) => {
      let previous: Settings | null = null;
      setSettings((current) => {
        previous = current;
        return current ? optimistic(current) : current;
      });
      setSaving(true);
      setPreview(null);
      try {
        const response = await axios.patch<Settings>("/assignments/settings", patch);
        setSettings(response.data);
        if (success) toast.success(success);
      } catch (error) {
        setSettings(previous);
        toast.error(apiErrorMessage(error, "Couldn't save the change. Try again."));
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const unassignedByCategory = React.useMemo(() => {
    const counts: Record<Category, number> = { fault: 0, new_connections: 0, relocation: 0 };
    for (const team of overview?.team_assignment ?? []) {
      for (const item of team.breakdown?.unassigned ?? []) {
        const category = categoryOfQueue(item.label);
        if (category) counts[category] += item.count;
      }
    }
    return counts;
  }, [overview]);

  const regionLabel = React.useCallback(
    (teamId: string) => settings?.regions.find((r) => r.team_id === teamId)?.label ?? "Other team",
    [settings],
  );

  const autoCategories = settings
    ? CATEGORIES.filter((c) => settings.categories[c.key] === "AUTO")
    : [];
  const enabledRegions = settings?.regions.filter((r) => r.enabled) ?? [];
  const canRun = Boolean(settings?.enabled && autoCategories.length && enabledRegions.length);

  async function runNow() {
    setRunning(true);
    try {
      const response = await axios.post<RunResult[]>("/assignments/auto-run", {});
      const assigned = response.data.reduce((n, r) => n + r.assigned.length, 0);
      const waiting = response.data.reduce((n, r) => n + r.waiting.length, 0);
      toast.success(
        assigned || waiting
          ? `${assigned} assigned${waiting ? ` · ${waiting} waiting for a technician` : ""}`
          : "Nothing to assign right now",
      );
      setPreview(null);
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't run auto-assign."));
    } finally {
      setRunning(false);
    }
  }

  async function loadPreview() {
    setPreviewing(true);
    try {
      const response = await axios.get<RunResult[]>("/assignments/preview");
      setPreview(response.data);
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't build the preview."));
    } finally {
      setPreviewing(false);
    }
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Auto-assign" description="Assign selected ticket categories to technicians automatically." />
        {loadError ? (
          <Card>
            <EmptyState
              variant="error"
              title="Couldn't load auto-assign"
              description={loadError}
              action={
                <Button variant="outline" size="sm" onClick={load}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-6" aria-busy="true">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        )}
      </div>
    );
  }

  const lastRun = settings.last_run_summary ?? [];
  const lastAssigned = lastRun.reduce((n, r) => n + r.assigned.length, 0);
  const lastWaiting = lastRun.reduce((n, r) => n + r.waiting.length, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Auto-assign"
        description="Choose which ticket categories go straight to a technician. Everything else waits in the pool for manual dispatch."
        actions={
          <>
            <Button variant="outline" onClick={loadPreview} disabled={previewing || !autoCategories.length}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview
            </Button>
            <Button onClick={runNow} disabled={!canRun || running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run now
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <Card className={cn("overflow-hidden", settings.enabled && "border-success/40")}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  settings.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                )}
              >
                <Zap className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p id="engine-title" className="text-base font-semibold">
                    Automatic assignment
                  </p>
                  <Badge variant={settings.enabled ? "success" : "outline"} dot>
                    {settings.enabled ? "On" : "Off"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {settings.enabled
                    ? autoCategories.length
                      ? `${autoCategories.map((c) => c.label).join(", ")} tickets in ${
                          enabledRegions.map((r) => r.label).join(" and ") || "no region"
                        } are assigned automatically, checked every minute.`
                      : "On, but every category is set to Manual, so nothing is assigned."
                    : "All tickets wait for manual dispatch."}
                </p>
                {settings.last_run_at && settings.enabled && (
                  <p className="text-xs text-muted-foreground">
                    Last run {moment(settings.last_run_at).fromNow()} · {lastAssigned} assigned
                    {lastWaiting ? ` · ${lastWaiting} waiting` : ""}
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              disabled={saving}
              aria-labelledby="engine-title"
              onCheckedChange={(next) => {
                if (next) setConfirmOn(true);
                else
                  save({ enabled: false }, (s) => ({ ...s, enabled: false }), "Auto-assign turned off");
              }}
            />
          </div>
        </Card>

        {settings.enabled && settings.pending_alerts.length > 0 && (
          <Card className="border-warning/50 bg-warning/5" role="alert">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {settings.pending_alerts.length} ticket{settings.pending_alerts.length === 1 ? "" : "s"} waiting for a
                technician
              </CardTitle>
              <CardDescription>
                These stay in the pool. Supervisors were notified; dispatch them manually or bring a technician online.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y rounded-lg border bg-card">
                {settings.pending_alerts.slice(0, 8).map((alert) => (
                  <li key={alert.ticket_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-medium tabular-nums">{alert.number ?? alert.ticket_id.slice(0, 8)}</span>
                      <Badge variant="outline">{CATEGORY_LABEL[alert.category]}</Badge>
                      <span className="text-muted-foreground">{regionLabel(alert.team_id)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{REASON_LABEL[alert.reason]}</span>
                      <span aria-hidden>·</span>
                      <span>waiting {moment(alert.since).fromNow(true)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {settings.pending_alerts.length > 8 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  and {settings.pending_alerts.length - 8} more
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              Auto sends new tickets in that category to the best available technician. Manual leaves them for a
              dispatcher. Other ticket types are always manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {CATEGORIES.map((category) => {
              const mode = settings.categories[category.key];
              const waiting = unassignedByCategory[category.key];
              return (
                <div
                  key={category.key}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        mode === "AUTO" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <category.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p id={`cat-${category.key}`} className="text-sm font-medium">
                        {category.label}
                      </p>
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                      {overview && (
                        <p
                          className={cn(
                            "mt-0.5 text-xs",
                            waiting ? "font-medium text-warning" : "text-muted-foreground",
                          )}
                        >
                          {waiting ? `${waiting} unassigned now` : "None unassigned"}
                        </p>
                      )}
                    </div>
                  </div>
                  <ModeToggle
                    labelledBy={`cat-${category.key}`}
                    value={mode}
                    disabled={saving}
                    onChange={(next) =>
                      save(
                        { categories: { [category.key]: next } },
                        (s) => ({ ...s, categories: { ...s.categories, [category.key]: next } }),
                        `${category.label} set to ${next === "AUTO" ? "Auto" : "Manual"}`,
                      )
                    }
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Regions</CardTitle>
              <CardDescription>Technicians are only matched to tickets in their own team.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {settings.regions.map((region) => (
                <div key={region.team_id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span id={`region-${region.team_id}`} className="text-sm font-medium">
                      {region.label}
                    </span>
                  </span>
                  <Switch
                    checked={region.enabled}
                    disabled={saving}
                    aria-labelledby={`region-${region.team_id}`}
                    onCheckedChange={(enabled) =>
                      save(
                        { team_enabled: { [region.team_id]: enabled } },
                        (s) => ({
                          ...s,
                          regions: s.regions.map((r) => (r.team_id === region.team_id ? { ...r, enabled } : r)),
                        }),
                        `${region.label} ${enabled ? "included" : "excluded"}`,
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Matching rules</CardTitle>
              <CardDescription>
                {overview?.technicians?.auto_assign_eligible !== undefined
                  ? `${overview.technicians.auto_assign_eligible} technician${
                      overview.technicians.auto_assign_eligible === 1 ? " is" : "s are"
                    } eligible right now.`
                  : "How a technician is chosen for each ticket."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <p id="strategy-label" className="text-sm font-medium">
                  Tie-break rule
                </p>
                <Select
                  value={settings.strategy}
                  disabled={saving}
                  onValueChange={(value) =>
                    save({ strategy: value as Strategy }, (s) => ({ ...s, strategy: value as Strategy }), "Rule updated")
                  }
                >
                  <SelectTrigger aria-labelledby="strategy-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGIES.map((strategy) => (
                      <SelectItem key={strategy.value} value={strategy.value}>
                        {strategy.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {STRATEGIES.find((s) => s.value === settings.strategy)?.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p id="max-jobs-label" className="text-sm font-medium">
                    Job limit per technician
                  </p>
                  <p className="text-xs text-muted-foreground">Assigned and in-progress jobs combined.</p>
                </div>
                <Select
                  value={String(settings.max_open_jobs)}
                  disabled={saving}
                  onValueChange={(value) =>
                    save(
                      { max_open_jobs: Number(value) },
                      (s) => ({ ...s, max_open_jobs: Number(value) }),
                      "Job limit updated",
                    )
                  }
                >
                  <SelectTrigger className="w-32" aria-labelledby="max-jobs-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} job{n === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                    <SelectItem value="0">No limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p id="busy-label" className="text-sm font-medium">
                    Include busy technicians
                  </p>
                  <p className="text-xs text-muted-foreground">Off by default. Offline technicians are never used.</p>
                </div>
                <Switch
                  checked={settings.include_busy}
                  disabled={saving}
                  aria-labelledby="busy-label"
                  onCheckedChange={(include_busy) =>
                    save({ include_busy }, (s) => ({ ...s, include_busy }), "Rule updated")
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {preview && (
          <PreviewCard preview={preview} regionLabel={regionLabel} onClose={() => setPreview(null)} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
            <CardDescription>The same steps run every minute while automatic assignment is on.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FLOW.map((step, index) => (
                <li key={step.title} className="relative rounded-lg border bg-muted/30 p-4">
                  <span className="mb-3 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <step.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">Step {index + 1}</span>
                  </span>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest automatic and manual assignments.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {activity === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState compact title="No assignments yet" description="Assignments will appear here as they happen." />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activity.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground" title={moment(row.created_at).format("LLL")}>
                          {moment(row.created_at).fromNow()}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {row.number ?? row.ticket_id.slice(0, 8)}
                        </TableCell>
                        <TableCell>{row.category ? CATEGORY_LABEL[row.category] : "—"}</TableCell>
                        <TableCell>
                          <ActivityResult row={row} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOn}
        onOpenChange={setConfirmOn}
        title="Turn on automatic assignment?"
        confirmLabel="Turn on"
        description={
          autoCategories.length
            ? `New ${autoCategories.map((c) => c.label).join(", ")} tickets in ${
                enabledRegions.map((r) => r.label).join(" and ") || "no region yet"
              } will be assigned to online technicians right away, and every minute after that. Technicians are notified in the app.`
            : "Every category is set to Manual, so nothing will be assigned until you switch at least one to Auto."
        }
        onConfirm={() => save({ enabled: true }, (s) => ({ ...s, enabled: true }), "Auto-assign turned on")}
      />
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  value: Mode;
  onChange: (value: Mode) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="inline-flex shrink-0 rounded-lg bg-muted p-1">
      {(["AUTO", "MANUAL"] as const).map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(option)}
            className={cn(
              "inline-flex min-w-[84px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
              active
                ? option === "AUTO"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "AUTO" && <Zap className="h-3.5 w-3.5" />}
            {option === "AUTO" ? "Auto" : "Manual"}
          </button>
        );
      })}
    </div>
  );
}

function ActivityResult({ row }: { row: Activity }) {
  if (row.action === "AUTO_ASSIGN_NO_CANDIDATE") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-warning">
        <AlertTriangle className="h-3.5 w-3.5" />
        Waiting · {row.reason ? REASON_LABEL[row.reason] : "no technician"}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={row.action === "AUTO_ASSIGN" ? "brand" : "outline"}>
        {row.action === "AUTO_ASSIGN" ? "Auto" : "Manual"}
      </Badge>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium">{row.technician_name ?? "Technician"}</span>
    </span>
  );
}

function PreviewCard({
  preview,
  regionLabel,
  onClose,
}: {
  preview: RunResult[];
  regionLabel: (teamId: string) => string;
  onClose: () => void;
}) {
  const rows = preview.flatMap((team) => [
    ...team.assigned.map((a) => ({ ...a, team_id: team.team_id, outcome: "assign" as const })),
    ...team.waiting.map((w) => ({ ...w, outcome: "wait" as const })),
  ]);
  const manual = preview.reduce((n, r) => n + r.manual_count, 0);

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Preview of the next run
          </CardTitle>
          <CardDescription>
            Nothing has been assigned. This is what would happen with the current settings
            {manual ? `; ${manual} ticket${manual === 1 ? "" : "s"} in Manual categories stay in the pool` : ""}.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={CheckCircle2}
            title="Nothing to assign"
            description="There are no unassigned tickets in Auto categories for the selected regions."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Would go to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.ticket_id}>
                    <TableCell className="font-medium tabular-nums">{row.number ?? row.ticket_id.slice(0, 8)}</TableCell>
                    <TableCell>{CATEGORY_LABEL[row.category]}</TableCell>
                    <TableCell className="text-muted-foreground">{regionLabel(row.team_id)}</TableCell>
                    <TableCell>
                      <Badge variant={row.priority === "HIGH" ? "warning" : "outline"}>
                        {row.priority ? row.priority.charAt(0) + row.priority.slice(1).toLowerCase() : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.outcome === "assign" ? (
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <UserCheck className="h-3.5 w-3.5 text-success" />
                          {row.technician_name ?? "Technician"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-warning">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Stays in pool · {REASON_LABEL[row.reason]}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
