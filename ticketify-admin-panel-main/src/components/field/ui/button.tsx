import { Loader2 } from "lucide-react";
import React from "react";
import { cn } from "@/lib/field/cn";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  text: string;
  loading?: boolean;
  icon?: React.ReactNode;
};

export function PrimaryButton({ text, loading, disabled, icon, className, style, ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-white transition active:opacity-80 disabled:opacity-50",
        className,
      )}
      style={style}
      {...rest}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      {loading ? null : text}
    </button>
  );
}

export function SecondaryButton({ text, loading, disabled, icon, className, ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "flex h-[52px] w-full items-center justify-center gap-2 rounded-md border border-bordergray bg-white px-4 text-base font-semibold text-ink transition active:bg-surface disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
      {text}
    </button>
  );
}
