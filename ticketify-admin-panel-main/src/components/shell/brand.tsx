import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-black shadow-sm ring-1 ring-inset ring-white/10",
        className,
      )}
    >
      <Image
        src="/brand/ticketify-icon.png"
        alt=""
        fill
        sizes="40px"
        priority
        className="object-cover"
      />
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
