"use client";

import * as React from "react";
import Link from "next/link";
import moment from "moment";
import { ArrowUpRight, MapPinOff, Search, Users, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/access";
import {
  PRESENCE_UI,
  resolveTechnicianPresence,
  type TechnicianPresenceState,
} from "@/lib/technician-presence";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  technicianCoords,
  type OperationsSnapshot,
  type RegionSummary,
  type Technician,
} from "./types";

export type PresenceFilter = "all" | TechnicianPresenceState;

type AutoAssignState = {
  visible: boolean;
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  onToggle: (next: boolean) => void;
};

type TechnicianPanelProps = {
  technicians: Technician[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  filter: PresenceFilter;
  onFilterChange: (value: PresenceFilter) => void;
  selectedId: string | null;
  onSelect: (technician: Technician) => void;
  onHover?: (id: string | null) => void;
  snapshot: OperationsSnapshot | null;
  autoAssign: AutoAssignState;
};

const FILTERS: { value: PresenceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "online", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "offline", label: "Offline" },
];

export function TechnicianPanel({
  technicians,
  loading,
  error,
  onRetry,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  onHover,
  snapshot,
  autoAssign,
}: TechnicianPanelProps) {
  const counts = React.useMemo(() => {
    const result: Record<PresenceFilter, number> = {
      all: technicians.length,
      online: 0,
      busy: 0,
      offline: 0,
    };
    for (const technician of technicians) {
      result[resolveTechnicianPresence(technician)] += 1;
    }
    return result;
  }, [technicians]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return technicians
      .filter((technician) => {
        if (filter !== "all" && resolveTechnicianPresence(technician) !== filter) {
          return false;
        }
        if (!needle) return true;
        return [technician.name, technician.email, technician.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => presenceRank(a) - presenceRank(b) || a.name.localeCompare(b.name));
  }, [technicians, query, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold tracking-tight">Live map</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading field team…" : `${counts.all} technicians · updates every 10s`}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Live
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search name, email or phone"
            aria-label="Search technicians"
            className="pl-9 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div role="radiogroup" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFilterChange(item.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.value !== "all" && (
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", PRESENCE_UI[item.value].dotClass)}
                    aria-hidden
                  />
                )}
                {item.label}
                <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-70")}>
                  {counts[item.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {(autoAssign.visible || snapshot?.regions) && (
        <div className="space-y-3 border-b p-4">
          {autoAssign.visible && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    autoAssign.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Zap className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p id="auto-assign-label" className="text-sm font-medium">
                    Auto-assign
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {autoAssign.loading
                      ? "Checking…"
                      : autoAssign.enabled
                        ? "New tickets are assigned automatically"
                        : "Tickets wait for manual dispatch"}
                  </p>
                </div>
              </div>
              <Switch
                checked={autoAssign.enabled}
                onCheckedChange={autoAssign.onToggle}
                disabled={autoAssign.loading || autoAssign.saving}
                aria-labelledby="auto-assign-label"
              />
            </div>
          )}

          {snapshot?.regions && <RegionSummaryList snapshot={snapshot} />}
        </div>
      )}

      <div
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2"
        onMouseLeave={() => onHover?.(null)}
      >
        {loading ? (
          <ul className="space-y-1" aria-busy="true" aria-label="Loading technicians">
            {Array.from({ length: 7 }).map((_, index) => (
              <li key={index} className="flex items-center gap-3 rounded-lg p-2.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : error && technicians.length === 0 ? (
          <EmptyState
            compact
            variant="error"
            title="Couldn't load technicians"
            description="Check your connection and try again."
            action={
              <Button size="sm" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            }
          />
        ) : technicians.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No technicians yet"
            description="Technicians appear here once they're added and sign in to the app."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            variant="no-results"
            title="No matches"
            description="Try a different name or status filter."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onQueryChange("");
                  onFilterChange("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className="space-y-0.5">
            {visible.map((technician) => (
              <li key={technician.id}>
                <TechnicianRow
                  technician={technician}
                  selected={technician.id === selectedId}
                  onSelect={() => onSelect(technician)}
                  onHover={onHover}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function presenceRank(technician: Technician) {
  const presence = resolveTechnicianPresence(technician);
  return presence === "online" ? 0 : presence === "busy" ? 1 : 2;
}

function TechnicianRow({
  technician,
  selected,
  onSelect,
  onHover,
}: {
  technician: Technician;
  selected: boolean;
  onSelect: () => void;
  onHover?: (id: string | null) => void;
}) {
  const presence = resolveTechnicianPresence(technician);
  const ui = PRESENCE_UI[presence];
  const lastSeen = technician.user_location_tracking?.[0]?.created_at;
  const hasLocation = Boolean(technicianCoords(technician));

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover?.(technician.id)}
      onFocus={() => onHover?.(technician.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors",
        selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent",
      )}
    >
      <span className="relative shrink-0">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {initials(technician.name)}
        </span>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
            ui.dotClass,
          )}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{technician.name}</span>
          {!hasLocation && (
            <MapPinOff
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label="No location shared"
            />
          )}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={ui.textClass}>{ui.label}</span>
          {lastSeen && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{moment(lastSeen).fromNow()}</span>
            </>
          )}
        </span>
        {presence === "busy" && technician.busy_comment && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            “{technician.busy_comment}”
          </span>
        )}
      </span>
    </button>
  );
}

function RegionSummaryList({ snapshot }: { snapshot: OperationsSnapshot }) {
  const regions: { key: string; label: string; region?: RegionSummary }[] = [
    { key: "male", label: "Malé", region: snapshot.regions?.male },
    { key: "hulhumale", label: "Hulhumalé", region: snapshot.regions?.hulhumale },
  ];
  if (snapshot.regions?.transport_lm) {
    regions.push({ key: "transport", label: "Transport", region: snapshot.regions.transport_lm });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ticket queue
        </p>
        <Link
          href="/dispatch"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          Operations board
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" className="px-2.5 py-1.5 text-left font-medium">
                Region
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium" title="New, not yet assigned">
                Unassigned
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Assigned
              </th>
              <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                Active
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {regions.map(({ key, label, region }) => {
              const unassigned = region?.unassigned_new ?? 0;
              return (
                <tr key={key}>
                  <th scope="row" className="px-2.5 py-1.5 text-left font-medium">
                    {label}
                  </th>
                  <td
                    className={cn(
                      "px-2 py-1.5 text-right tabular-nums",
                      unassigned > 0 && "font-semibold text-warning",
                    )}
                  >
                    {unassigned}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{region?.assigned_new ?? 0}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{region?.in_progress ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
