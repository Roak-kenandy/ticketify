"use client";

import { ClipboardList, Package, PackageMinus, RefreshCw, ScanLine } from "lucide-react";
import moment from "moment";
import React from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import HandoverSheet, { type HandoverMode } from "@/components/field/stock/handover-sheet";
import RequestStockSheet from "@/components/field/stock/request-sheet";
import { PrimaryButton, SecondaryButton } from "@/components/field/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/field/ui/state-views";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { fieldCardGrid, fieldContainer } from "@/lib/field/layout";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import { useMyStock } from "@/lib/field/stock";

type StockRequest = {
  id: string;
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  created_at: string;
  closed_at: string | null;
  lines: { item_id: string; item_name: string; quantity: number; uom: string }[];
};

const REQUEST_STATUS: Record<StockRequest["status"], { label: string; className: string }> = {
  OPEN: { label: "Waiting for store", className: "bg-[#FFF4E0] text-[#8A5A00]" },
  FULFILLED: { label: "Issued", className: "bg-[#E6F6EC] text-[#1E7B43]" },
  CANCELLED: { label: "Cancelled", className: "bg-surface text-gray2" },
};

function amount(value: number, uom: string) {
  return `${Number(value.toFixed(2))} ${uom}`;
}

export default function MyStockPage() {
  const { token } = useSession();
  const { stock, loading, error, reload } = useMyStock();
  const [handover, setHandover] = React.useState<HandoverMode | null>(null);
  const [requesting, setRequesting] = React.useState(false);
  const [requests, setRequests] = React.useState<StockRequest[]>([]);
  const items = stock?.items ?? [];
  const supervisor = stock?.holder === "SUPERVISOR";

  const loadRequests = React.useCallback(() => {
    if (!token) return;
    apiGet("/inventory/stock/requests", token, { silent: true })
      .then((rows: StockRequest[]) => setRequests((rows ?? []).slice(0, 5)))
      .catch(() => setRequests([]));
  }, [token]);

  React.useEffect(() => {
    if (supervisor) loadRequests();
  }, [supervisor, loadRequests]);

  const refresh = () => {
    void reload();
    if (supervisor) loadRequests();
  };

  async function cancelRequest(id: string) {
    try {
      await apiPost(`/inventory/stock/requests/${id}/cancel`, {}, token);
      showSuccess("Request cancelled");
      loadRequests();
    } catch (err: any) {
      showError(err?.message || "Could not cancel the request");
    }
  }

  return (
    <>
      <ScreenHeader
        title="My stock"
        subtitle={supervisor ? "Stock the store issued to you, to hand out to technicians" : "Items your supervisor handed to you"}
        wide
      />
      <main className={cn(fieldContainer.wide, "flex flex-col gap-3 p-4 pb-16")}>
        {supervisor ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <PrimaryButton
              text="Hand out"
              icon={<ScanLine className="h-5 w-5" />}
              onClick={() => setHandover("handout")}
            />
            <SecondaryButton
              text="Take back"
              icon={<PackageMinus className="h-5 w-5" />}
              onClick={() => setHandover("takeback")}
            />
            <SecondaryButton
              text="Request stock"
              icon={<ClipboardList className="h-5 w-5" />}
              onClick={() => setRequesting(true)}
            />
          </div>
        ) : null}

        {supervisor && requests.length ? (
          <section className="flex flex-col gap-2 rounded-lg border border-borderlight bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">My requests</h2>
            {requests.map((request) => (
              <div key={request.id} className="flex items-start justify-between gap-3 border-t border-borderlight pt-2 first-of-type:border-0">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    {request.lines.map((line) => `${line.item_name} × ${amount(line.quantity, line.uom)}`).join(", ")}
                  </p>
                  <p className="text-[11px] text-gray2">{moment(request.created_at).format("DD MMM, HH:mm")}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", REQUEST_STATUS[request.status].className)}>
                    {REQUEST_STATUS[request.status].label}
                  </span>
                  {request.status === "OPEN" ? (
                    <button type="button" onClick={() => cancelRequest(request.id)} className="text-[12px] font-semibold text-error">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray2">
            {supervisor
              ? "Scan each ONT box when you hand it over so the right serial follows the technician."
              : stock?.restricted === false
                ? "You can record any catalog item; this list shows what you hold."
                : "Only these items can be recorded on your tickets."}
          </p>
          <button
            type="button"
            onClick={refresh}
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
            title={supervisor ? "No stock with you" : "Nothing issued to you"}
            message={
              supervisor
                ? "Use Request stock to ask the store for ONTs and materials."
                : "Ask your supervisor to hand you the materials and ONTs you need."
            }
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
                  {(supervisor
                    ? [
                        ["From store", entry.issued],
                        ["Handed out", entry.handed_out - entry.taken_back],
                        ["Returned", entry.returned],
                      ]
                    : [
                        ["Received", entry.issued],
                        ["Used", entry.consumed],
                        ["Returned", entry.returned],
                      ]
                  ).map(([label, value]) => (
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

      {supervisor ? (
        <>
          <HandoverSheet
            visible={handover !== null}
            mode={handover ?? "handout"}
            myStock={stock}
            onClose={() => setHandover(null)}
            onDone={refresh}
          />
          <RequestStockSheet
            visible={requesting}
            myStock={stock}
            onClose={() => setRequesting(false)}
            onDone={loadRequests}
          />
        </>
      ) : null}
    </>
  );
}
