"use client";

import moment from "moment";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/app/filter-bar";
import { formatQuantity, STOCK_LOG_KIND_LABEL, type StockLogEntry, type StockLogKind } from "@/lib/inventory";

const KIND_BADGE: Record<StockLogKind, "brand" | "info" | "secondary" | "warning"> = {
  STORE_ISSUE: "brand",
  HANDOUT: "info",
  TAKE_BACK: "warning",
  STORE_RETURN: "secondary",
};

const SERIALS_SHOWN = 4;

function Serials({ serials }: { serials: string[] }) {
  if (!serials.length) return null;
  const chips = (list: string[]) =>
    list.map((serial) => (
      <span key={serial} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
        {serial}
      </span>
    ));
  if (serials.length <= SERIALS_SHOWN) return <div className="mt-1 flex flex-wrap gap-1">{chips(serials)}</div>;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-xs text-muted-foreground">
        <span className="inline-flex flex-wrap gap-1 align-middle">{chips(serials.slice(0, SERIALS_SHOWN))}</span>{" "}
        +{serials.length - SERIALS_SHOWN} more
      </summary>
      <div className="mt-1 flex flex-wrap gap-1">{chips(serials.slice(SERIALS_SHOWN))}</div>
    </details>
  );
}

/** Header + body for the "Issue log" view; one row per slip. */
export function StockLogTable({ rows, loading }: { rows: StockLogEntry[]; loading: boolean }) {
  return (
    <>
      <TableHeader sticky>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>From → to</TableHead>
          <TableHead>Items given</TableHead>
          <TableHead>Requested by</TableHead>
          <TableHead>Recorded by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableSkeletonRows columns={6} rows={8} />
        ) : (
          rows.map((entry) => (
            <TableRow key={entry.batch_id} className="align-top">
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {moment(entry.at).format("DD MMM YYYY")}
                <div className="text-[11px]">{moment(entry.at).format("HH:mm")}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge variant={KIND_BADGE[entry.kind]}>{STOCK_LOG_KIND_LABEL[entry.kind]}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span className={entry.from_name === "Store" ? "text-muted-foreground" : "font-medium"}>
                    {entry.from_name}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={entry.to_name === "Store" ? "text-muted-foreground" : "font-medium"}>
                    {entry.to_name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="min-w-[260px]">
                {entry.lines.map((line) => (
                  <div key={line.item_code} className="py-0.5 text-sm">
                    <span className="font-medium">{line.item_name}</span> × {formatQuantity(line.quantity, line.uom)}
                    {line.faulty > 0 && (
                      <span className="text-xs text-destructive"> · {formatQuantity(line.faulty, line.uom)} faulty</span>
                    )}
                    <Serials serials={line.serials} />
                  </div>
                ))}
                {(entry.reference || entry.notes) && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {[entry.reference, entry.notes].filter(Boolean).join(" · ")}
                  </div>
                )}
              </TableCell>
              <TableCell className="min-w-[180px]">
                {entry.request ? (
                  <>
                    <div className="font-medium">{entry.request.requested_by_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {moment(entry.request.requested_at).format("DD MMM, HH:mm")} · asked for{" "}
                      {entry.request.lines
                        .map((line) => `${line.item_name} × ${formatQuantity(line.quantity, line.uom)}`)
                        .join(", ")}
                    </div>
                    {entry.request.notes && (
                      <div className="text-[11px] text-muted-foreground">“{entry.request.notes}”</div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {entry.kind === "STORE_ISSUE" ? "Not from a request" : "—"}
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{entry.performed_by_name}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </>
  );
}
