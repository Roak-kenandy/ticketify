import {
  AlertCircle,
  CloudOff,
  Inbox,
  Info,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import React from "react";
import { cn } from "@/lib/field/cn";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  actionLabel,
  onAction,
  compact,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-5 text-center",
        compact ? "py-5" : "py-8",
        className,
      )}
    >
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-tertiary">
        <Icon className={cn("text-primary", compact ? "h-[22px] w-[22px]" : "h-7 w-7")} />
      </div>
      <p className="text-base font-semibold text-ink">{title}</p>
      {message ? <p className="text-[13px] leading-[19px] text-gray2">{message}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white active:opacity-80"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  compact,
}: {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Couldn't load this"
      message={message || "Check your connection and try again."}
      actionLabel={onRetry ? "Try again" : undefined}
      onAction={onRetry}
      compact={compact}
    />
  );
}

const BANNER_TONES = {
  warning: "bg-warning-bg text-warning",
  error: "bg-error-bg text-error",
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success",
} as const;

export function InlineBanner({
  tone = "warning",
  icon: Icon,
  message,
  actionLabel,
  onAction,
}: {
  tone?: keyof typeof BANNER_TONES;
  icon?: LucideIcon;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const Fallback = tone === "info" ? Info : AlertCircle;
  const Shown = Icon ?? Fallback;
  return (
    <div className={cn("flex items-center gap-2 rounded-md px-3 py-2.5", BANNER_TONES[tone])}>
      <Shown className="h-[18px] w-[18px] shrink-0" />
      <p className="flex-1 text-[13px] font-medium">{message}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="text-[13px] font-bold">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {label ? <p className="text-[13px] text-gray2">{label}</p> : null}
    </div>
  );
}

/** Pulsing placeholder block for skeleton layouts. */
export function Skeleton({
  width = "100%",
  height = 14,
  rounded,
  className,
}: {
  width?: number | string;
  height?: number;
  rounded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("animate-pulse-soft bg-skeleton", className)}
      style={{ width, height, borderRadius: rounded ? height / 2 : 8 }}
    />
  );
}

export function TicketCardSkeleton() {
  return (
    <div className="rounded-lg border border-borderlight bg-white p-4">
      <div className="flex items-center gap-3">
        <Skeleton width={44} height={44} className="!rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton width="45%" height={16} />
          <Skeleton width="65%" height={12} />
        </div>
      </div>
      <Skeleton height={12} className="mt-3" />
      <Skeleton width="80%" height={12} className="mt-1.5" />
      <div className="mt-3 flex gap-3">
        <Skeleton width={64} height={22} rounded />
        <Skeleton width={84} height={22} rounded />
      </div>
    </div>
  );
}
