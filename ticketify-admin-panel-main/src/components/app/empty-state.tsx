import { AlertTriangle, Inbox, SearchX, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "empty" | "no-results" | "error";

const DEFAULT_ICON: Record<Variant, LucideIcon> = {
  empty: Inbox,
  "no-results": SearchX,
  error: AlertTriangle,
};

export function EmptyState({
  variant = "empty",
  icon,
  title,
  description,
  action,
  compact,
  className,
}: {
  variant?: Variant;
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const Icon = icon ?? DEFAULT_ICON[variant];
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          compact ? "h-10 w-10" : "h-12 w-12",
          variant === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
