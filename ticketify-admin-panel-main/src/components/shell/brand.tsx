import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0a4f94] to-brand-navy text-white shadow-sm ring-1 ring-inset ring-white/10",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v1.25a1.75 1.75 0 0 0 0 3.5v1.25A2.5 2.5 0 0 1 17.5 16h-11A2.5 2.5 0 0 1 4 13.5v-1.25a1.75 1.75 0 0 0 0-3.5V7.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="m9 10.6 2 2 4-4.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 19h8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".55"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({
  collapsed,
  inverted,
}: {
  collapsed?: boolean;
  inverted?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span
            className={cn(
              "truncate text-[15px] font-semibold tracking-tight",
              inverted ? "text-white" : "text-foreground",
            )}
          >
            Ticketify
          </span>
          <span
            className={cn(
              "truncate text-[11px] font-medium",
              inverted ? "text-white/60" : "text-muted-foreground",
            )}
          >
            Medianet Operations
          </span>
        </span>
      )}
    </span>
  );
}
