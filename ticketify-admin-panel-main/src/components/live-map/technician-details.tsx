"use client";

import * as React from "react";
import moment from "moment";
import {
  Clock,
  Mail,
  MapPin,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/access";
import { PRESENCE_UI, resolveTechnicianPresence } from "@/lib/technician-presence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import type { PathPlayback, PlaybackSpeed } from "./use-path-playback";
import type { Technician, TechnicianDetails as Details, TechnicianTicket } from "./types";

type TechnicianDetailsProps = {
  technician: Technician | null;
  details: Details | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
  onFocusLocation: () => void;
  playback: PathPlayback;
  onStartPlayback: () => void;
};

type DetailTab = "requests" | "feedback";

export function TechnicianDetailsPanel({
  technician,
  details,
  loading,
  error,
  onRetry,
  onClose,
  onFocusLocation,
  playback,
  onStartPlayback,
}: TechnicianDetailsProps) {
  const [tab, setTab] = React.useState<DetailTab>("requests");
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
  }, [technician?.id]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const person = details?.user ?? technician;
  const presence = resolveTechnicianPresence(person);
  const ui = PRESENCE_UI[presence];
  const tickets = details?.serviceTickets;
  const ratings = details?.ratings;
  const tracking = details?.locationTracking;

  return (
    <aside
      aria-label="Technician details"
      className="flex h-full flex-col border-l bg-card shadow-elevated"
    >
      <header className="flex items-start gap-3 border-b p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {person ? initials(person.name) : "–"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{person?.name ?? "Technician"}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={ui.badge} dot>
              {ui.label}
            </Badge>
            {details?.user.role?.name && (
              <Badge variant="secondary">{details.user.role.name}</Badge>
            )}
          </div>
        </div>
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close details"
          className="-mr-2 -mt-1"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {loading && !details ? (
          <DetailsSkeleton />
        ) : error && !details ? (
          <EmptyState
            variant="error"
            title="Couldn't load details"
            description="The technician's activity couldn't be fetched."
            action={
              <Button size="sm" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            }
          />
        ) : details ? (
          <div className="space-y-5 p-4">
            {presence === "busy" && details.user.busy_comment && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">
                <p className="font-medium text-warning">Busy</p>
                <p className="mt-0.5 text-foreground/90">{details.user.busy_comment}</p>
                {details.user.busy_until && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Until {moment(details.user.busy_until).format("h:mm A, D MMM")}
                  </p>
                )}
              </div>
            )}

            <section aria-label="Contact" className="space-y-1">
              {details.user.email && (
                <ContactLink href={`mailto:${details.user.email}`} icon={Mail}>
                  {details.user.email}
                </ContactLink>
              )}
              {details.user.phone && (
                <ContactLink href={`tel:${details.user.phone}`} icon={Phone}>
                  {details.user.phone}
                </ContactLink>
              )}
            </section>

            <section aria-label="Workload" className="grid grid-cols-3 gap-2">
              <Metric label="New" value={tickets?.new ?? 0} tone="info" />
              <Metric label="In progress" value={tickets?.in_progress ?? 0} tone="warning" />
              <Metric label="Closed" value={tickets?.closed ?? 0} tone="success" />
            </section>

            <section className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <p className="text-xs text-muted-foreground">Customer rating</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                  {ratings?.totalFeedbacks ? Number(ratings.averageRating).toFixed(1) : "—"}
                  <Stars value={ratings?.averageRating ?? 0} />
                </p>
              </div>
              <p className="text-right text-xs text-muted-foreground">
                {ratings?.totalFeedbacks ?? 0} review{ratings?.totalFeedbacks === 1 ? "" : "s"}
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Location</h3>
                {tracking?.currentLocation && (
                  <Button variant="ghost" size="sm" onClick={onFocusLocation} className="-mr-2">
                    <MapPin className="h-3.5 w-3.5" />
                    Show on map
                  </Button>
                )}
              </div>
              {tracking?.currentLocation ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Last update {moment(tracking.currentLocation.created_at).fromNow()}
                  <span className="text-xs">
                    ({moment(tracking.currentLocation.created_at).format("h:mm A")})
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No location shared yet.</p>
              )}
              <PlaybackControls playback={playback} onStart={onStartPlayback} />
            </section>

            <section className="space-y-3">
              <Tabs<DetailTab>
                label="Technician activity"
                value={tab}
                onValueChange={setTab}
                items={[
                  { value: "requests", label: "Requests", count: tickets?.total ?? 0 },
                  { value: "feedback", label: "Feedback", count: ratings?.totalFeedbacks ?? 0 },
                ]}
              />
              {tab === "requests" ? (
                <TicketList tickets={tickets?.tickets ?? []} />
              ) : (
                <FeedbackList feedbacks={ratings?.feedbacks ?? []} />
              )}
            </section>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ContactLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </a>
  );
}

const METRIC_TONES = {
  info: "text-info",
  warning: "text-warning",
  success: "text-success",
} as const;

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof METRIC_TONES;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <p className={cn("text-xl font-semibold tabular-nums", METRIC_TONES[tone])}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${Number(value).toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden
          className={cn(
            "h-3.5 w-3.5",
            star <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 4];

export function PlaybackControls({
  playback,
  onStart,
  compact,
}: {
  playback: PathPlayback;
  onStart: () => void;
  compact?: boolean;
}) {
  const { path, index, playing, active } = playback;

  if (path.length < 2) {
    return compact ? null : (
      <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        Not enough location history in the last 8 hours to replay a route.
      </p>
    );
  }

  const current = path[index]?.point;

  return (
    <div className={cn("space-y-2.5", !compact && "rounded-lg border p-3")}>
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Route · last 8 hours</span>
          <span className="text-muted-foreground">{path.length} points</span>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={path.length - 1}
        value={index}
        onChange={(event) => playback.seek(Number(event.target.value))}
        aria-label="Route position"
        aria-valuetext={current ? moment(current.created_at).format("h:mm A") : undefined}
        className="range-track w-full"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={playing ? playback.pause : onStart}
            aria-label={playing ? "Pause route" : "Play route"}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : active && index > 0 ? "Resume" : "Play"}
          </Button>
          {active && (
            <Button size="sm" variant="ghost" onClick={playback.stop} aria-label="Reset route">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {current ? moment(current.created_at).format("h:mm A") : ""}
          </span>
          <div role="radiogroup" aria-label="Playback speed" className="flex rounded-md border p-0.5">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                role="radio"
                aria-checked={playback.speed === speed}
                onClick={() => playback.setSpeed(speed)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                  playback.speed === speed
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATE_BADGE: Record<string, "info" | "warning" | "success" | "secondary"> = {
  NEW: "info",
  IN_PROGRESS: "warning",
  CLOSED: "success",
};

function TicketList({ tickets }: { tickets: TechnicianTicket[] }) {
  if (!tickets.length) {
    return <EmptyState compact title="No requests" description="Nothing assigned to this technician." />;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {tickets.map((ticket, index) => (
        <li key={`${ticket.number ?? "ticket"}-${index}`} className="space-y-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm font-medium leading-snug">
              {ticket.title || ticket.number || "Untitled request"}
            </p>
            {ticket.state && (
              <Badge variant={STATE_BADGE[ticket.state] ?? "secondary"} className="shrink-0">
                {ticket.state.replace(/_/g, " ").toLowerCase()}
              </Badge>
            )}
          </div>
          {ticket.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{ticket.description}</p>
          )}
          <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {ticket.number && <span className="font-mono">{ticket.number}</span>}
            {ticket.contact?.name && <span>{ticket.contact.name}</span>}
            {ticket.created_at && <span>{moment(ticket.created_at).format("D MMM, h:mm A")}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function FeedbackList({ feedbacks }: { feedbacks: NonNullable<Details["ratings"]["feedbacks"]> }) {
  if (!feedbacks.length) {
    return <EmptyState compact title="No feedback yet" description="Customer reviews will show here." />;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {feedbacks.map((feedback, index) => (
        <li key={index} className="space-y-1 p-3">
          <div className="flex items-center justify-between gap-2">
            <Stars value={feedback.rating} />
            {feedback.created_at && (
              <span className="text-xs text-muted-foreground">
                {moment(feedback.created_at).format("D MMM YYYY")}
              </span>
            )}
          </div>
          <p className="text-sm">
            {feedback.comment || feedback.feedback || (
              <span className="text-muted-foreground">No comment left.</span>
            )}
          </p>
          {feedback.customer_name && (
            <p className="text-xs text-muted-foreground">{feedback.customer_name}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-5 p-4" aria-busy="true" aria-label="Loading details">
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <Skeleton className="h-24" />
      <Skeleton className="h-9" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}
