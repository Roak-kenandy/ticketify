"use client";

import { Package, RefreshCw } from "lucide-react";
import React from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import { EmptyState, ErrorState, Skeleton } from "@/components/field/ui/state-views";
import { cn } from "@/lib/field/cn";
import { fieldCardGrid, fieldContainer } from "@/lib/field/layout";
import { useMyStock } from "@/lib/field/stock";

function amount(value: number, uom: string) {
  return `${Number(value.toFixed(2))} ${uom}`;
}

export default function MyStockPage() {
  const { stock, loading, error, reload } = useMyStock();
  const items = stock?.items ?? [];

  return (
    <>
      <ScreenHeader title="My stock" subtitle="Items the inventory team issued to you" wide />
      <main className={cn(fieldContainer.wide, "flex flex-col gap-3 p-4 pb-16")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray2">
            {stock?.restricted === false
              ? "You can record any catalog item; this list shows what is issued to you."
              : "Only these items can be recorded on your tickets."}
          </p>
          <button
            type="button"
            onClick={() => reload()}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-borderlight bg-white px-3 py-1.5 text-[13px] font-semibold text-primary disabled:opacity-60"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </button>
        </div>

        {error && !stock ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !stock ? (
          <div className={fieldCardGrid}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nothing issued to you"
            message="Ask the inventory team to issue the materials and ONTs you need."
          />
        ) : (
          <div className={fieldCardGrid}>
            {items.map((entry) => (
              <div key={entry.item.id} className="flex flex-col gap-3 rounded-lg border border-borderlight bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{entry.item.name}</p>
                    <p className="mt-0.5 text-xs text-gray2">{entry.item.category}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-tertiary px-3 py-1 text-sm font-bold text-primary">
                    {amount(entry.in_hand, entry.item.consumption_uom)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Issued", entry.issued],
                    ["Used", entry.consumed],
                    ["Returned", entry.returned],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-md bg-surface py-2">
                      <p className="text-sm font-semibold tabular-nums text-ink">{Number((value as number).toFixed(2))}</p>
                      <p className="text-[11px] text-gray2">{label}</p>
                    </div>
                  ))}
                </div>
                {entry.item.serialized && entry.serials.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.serials.map((unit) => (
                      <span
                        key={unit.serial_number}
                        className="rounded-md border border-borderlight px-2 py-1 font-mono text-[11px] text-ink"
                      >
                        {unit.serial_number}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
