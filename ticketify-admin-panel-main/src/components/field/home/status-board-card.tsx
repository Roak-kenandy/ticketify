"use client";

import Link from "next/link";
import { Skeleton } from "@/components/field/ui/state-views";
import { STATUS_BUCKETS, type StatusBoard } from "@/lib/field/status-board";

export default function StatusBoardCard({ board, error }: { board: StatusBoard | null; error?: string | null }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg bg-white p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Ticket status</h2>
        <span className="text-xs font-semibold text-gray2">
          {board ? (board.scope === "all" ? "All teams" : "Your tickets") : error ? "Unavailable" : ""}
        </span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {STATUS_BUCKETS.map((bucket) => {
          const Icon = bucket.icon;
          const count = board?.counts[bucket.key];
          const unknown = bucket.key === "no_response" && board && !board.no_response_available;
          return (
            <Link
              key={bucket.key}
              href={`/field/status?bucket=${bucket.key}`}
              aria-label={`${bucket.label}: ${unknown ? "unavailable" : (count ?? "loading")}`}
              title={bucket.hint}
              className="flex items-center gap-3 rounded-md border px-3 py-2.5 active:opacity-80"
              style={{ backgroundColor: bucket.bg, borderColor: `${bucket.color}33` }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70"
                style={{ color: bucket.color }}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="flex min-w-0 flex-col">
                {board ? (
                  <span className="text-[22px] font-bold leading-7 text-ink">{unknown ? "–" : count}</span>
                ) : error ? (
                  <span className="text-[22px] font-bold leading-7 text-gray3">–</span>
                ) : (
                  <Skeleton width={28} height={26} />
                )}
                <span className="text-xs font-semibold leading-tight" style={{ color: bucket.color }}>
                  {bucket.label}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
