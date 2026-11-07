"use client";

import { Check, ChevronDown, ChevronLeft, Search, X } from "lucide-react";
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

function searchKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Searchable dropdown styled like `.input`. */
export function SelectInput({
  value,
  options,
  placeholder,
  onChange,
  error,
  disabled,
  label,
  extra,
}: {
  value: string | null;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string | null) => void;
  error?: boolean;
  disabled?: boolean;
  /** Accessible name; the visible label comes from the surrounding field. */
  label: string;
  /** Trailing action option such as "+ Add new city"; always listed. */
  extra?: { value: string; label: string };
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();
  const selected = options.find((option) => option.value === value);
  const needle = searchKey(query);
  const matches = needle ? options.filter((option) => searchKey(option.label).includes(needle)) : options;
  const items = extra ? [...matches, extra] : matches;

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    if (disabled) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(Math.max(0, index));
    setOpen(true);
  };

  const choose = (next: string) => {
    onChange(next);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div className={cn("input flex items-center gap-2 border-primary pr-3", error && "border-error")}>
          <Search className="h-4 w-4 shrink-0 text-gray2" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-label={label}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-gray3"
            placeholder={selected ? selected.label : "Type to search…"}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" onClick={close} aria-label="Close list" className="shrink-0">
            <X className="h-4 w-4 text-gray2" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openList}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-label={label}
          className={cn(
            "input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed",
            error && "border-error",
          )}
        >
          <span className={cn("truncate", selected ? "text-ink" : "text-gray3")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-gray2" />
        </button>
      )}
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-md border border-borderlight bg-white shadow-lg">
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-64 overflow-y-auto py-1"
          >
            {matches.map((item, index) => {
              const isSelected = item.value === value;
              return (
                <li
                  key={item.value}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(item.value)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-[14px] text-ink",
                    index === active && "bg-surface",
                    isSelected && "font-semibold",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </li>
              );
            })}
            {!matches.length ? (
              <li className="px-3 py-2.5 text-[13px] text-gray2" role="presentation">
                No match for “{query}”
              </li>
            ) : null}
          </ul>
          {extra ? (
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(extra.value)}
              onMouseEnter={() => setActive(matches.length)}
              className={cn(
                "flex w-full items-center gap-2 border-t border-borderlight px-3 py-3 text-left text-[14px] font-semibold text-primary",
                active === matches.length && "bg-surface",
              )}
            >
              {extra.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Client-generated key so a retried submission is applied only once. */
export function newIdempotencyKey(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
