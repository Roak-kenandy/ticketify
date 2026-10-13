import { cn } from "@/lib/field/cn";
import type { Tone } from "@/lib/field/ticket-meta";

export function ToneBadge({
  tone,
  size = "md",
  showIcon,
}: {
  tone: Tone;
  size?: "sm" | "md";
  showIcon?: boolean;
}) {
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-2 py-[3px] text-[11px]" : "px-2.5 py-1 text-xs",
      )}
      style={{ color: tone.color, backgroundColor: tone.bg }}
    >
      {showIcon && Icon ? (
        <Icon className={size === "sm" ? "h-[11px] w-[11px]" : "h-[13px] w-[13px]"} />
      ) : null}
      {tone.label}
    </span>
  );
}
