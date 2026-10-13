"use client";

import { ChevronLeft, X } from "lucide-react";
import React from "react";
import { cn } from "@/lib/field/cn";
import { Overlay } from "./overlay";

/** Full-screen slide-up sheet shared by the ticket workflow modals. */
export default function WorkflowSheet({
  visible,
  title,
  subtitle,
  onClose,
  onBack,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  /** Shown left of the title, e.g. a back arrow for nested steps. */
  onBack?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Overlay open={visible} onEscape={onBack ?? onClose}>
      <div className="fixed inset-0 z-50 flex justify-center bg-[rgba(15,23,42,0.55)]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flex h-[100dvh] w-full max-w-3xl animate-slide-up flex-col bg-surface"
        >
          <div className="flex items-center gap-2 border-b border-borderlight bg-white px-5 py-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
              >
                <ChevronLeft className="h-[22px] w-[22px] text-ink" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-xs font-medium text-gray2">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
            >
              <X className="h-[22px] w-[22px] text-ink" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
          {footer ? (
            <div className="flex gap-3 border-t border-borderlight bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}

/** Padded, gapped body column used inside sheets. */
export function SheetBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 p-5 pb-8", className)}>{children}</div>;
}

export function SheetCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-5 text-center">
      {children}
    </div>
  );
}

export function SheetCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-borderlight bg-white p-4", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("mt-2 text-sm font-semibold text-ink", className)}>{children}</h3>;
}

/** Label/value line used for read-only facts. */
export function Fact({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-[13px] text-gray2">{label}</span>
      {typeof value === "string" || typeof value === "number" ? (
        <span className="text-right text-[13px] font-semibold text-ink">{value}</span>
      ) : (
        value
      )}
    </div>
  );
}

/** Single-choice pill group. */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-2 text-[13px]",
              on
                ? "border-primary bg-primary font-bold text-white"
                : "border-bordergray bg-white font-medium text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Client-generated key so a retried submission is applied only once. */
export function newIdempotencyKey(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
