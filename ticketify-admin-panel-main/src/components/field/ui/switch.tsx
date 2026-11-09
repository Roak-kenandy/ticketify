import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/field/cn";

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-gray3",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      >
        {checked ? <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/** A setting row (Notify customer, New ONT installed, …): tapping anywhere on it flips the switch. */
export function SwitchRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
  className,
}: {
  title: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-md border px-3 py-3 transition-colors",
        checked ? "border-primary/40 bg-tertiary/40" : "border-borderlight bg-white",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hint ? <p className="text-xs leading-snug text-gray2">{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}
