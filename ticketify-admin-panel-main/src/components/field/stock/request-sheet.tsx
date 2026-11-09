"use client";

import { Search } from "lucide-react";
import React from "react";
import { PrimaryButton } from "@/components/field/ui/button";
import WorkflowSheet, { SheetBody, SheetCard } from "@/components/field/ui/workflow-sheet";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showSuccess } from "@/lib/field/notify";
import { useSession } from "@/lib/field/session";
import type { InventoryItem, MyStock } from "@/types/field-workflow";

/** Supervisor asks the store for more stock; the store issues against it. */
export default function RequestStockSheet({
  visible,
  myStock,
  onClose,
  onDone,
}: {
  visible: boolean;
  myStock: MyStock | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useSession();
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setQuantities({});
    setSearch("");
    setNotes("");
    if (!token) return;
    apiGet("/inventory/items", token, { silent: true })
      .then((rows: InventoryItem[]) => setItems(rows ?? []))
      .catch(() => showError("Could not load the item list"));
  }, [visible, token]);

  const held = new Map((myStock?.items ?? []).map((entry) => [entry.item.id, entry.in_hand]));
  const needle = search.trim().toLowerCase();
  const shown = items.filter(
    (item) => !needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle),
  );
  const lines = items.flatMap((item) => {
    const quantity = Number(quantities[item.id]);
    return quantity > 0 ? [{ item, quantity }] : [];
  });
  const invalid = lines.find(
    ({ item, quantity }) => (item.serialized || !item.allow_decimal) && !Number.isInteger(quantity),
  );

  async function submit() {
    if (!lines.length || invalid || busy) return;
    setBusy(true);
    try {
      await apiPost(
        "/inventory/stock/requests",
        {
          lines: lines.map(({ item, quantity }) => ({ item_id: item.id, quantity })),
          notes: notes.trim() || undefined,
        },
        token,
      );
      showSuccess("Request sent to the store");
      onDone();
      onClose();
    } catch (error: any) {
      showError(error?.message || "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkflowSheet
      visible={visible}
      title="Request stock"
      subtitle="The store sees this and issues the items to you"
      onClose={busy ? () => undefined : onClose}
      footer={
        <PrimaryButton
          text={lines.length ? `Send request · ${lines.length} item${lines.length === 1 ? "" : "s"}` : "Send request"}
          disabled={!lines.length || Boolean(invalid)}
          loading={busy}
          onClick={submit}
        />
      }
    >
      <SheetBody>
        <div className="input flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-gray2" />
          <input
            className="h-full min-w-0 flex-1 bg-transparent outline-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items"
            aria-label="Search items"
          />
        </div>
        {shown.map((item) => {
          const value = quantities[item.id] ?? "";
          const wrong = Number(value) > 0 && (item.serialized || !item.allow_decimal) && !Number.isInteger(Number(value));
          return (
            <SheetCard key={item.id} className="flex-row items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{item.name}</p>
                <p className="text-xs text-gray2">
                  {held.has(item.id) ? `You hold ${Number((held.get(item.id) ?? 0).toFixed(2))}` : "You hold none"}
                  {" · "}
                  {item.consumption_uom}
                </p>
                {wrong ? <p className="text-xs text-error">Whole numbers only</p> : null}
              </div>
              <input
                className={cn("input w-24 shrink-0 text-right", wrong && "border-error")}
                type="number"
                inputMode={item.allow_decimal && !item.serialized ? "decimal" : "numeric"}
                min="0"
                value={value}
                onChange={(event) => setQuantities((all) => ({ ...all, [item.id]: event.target.value }))}
                placeholder="0"
                aria-label={`${item.name} quantity`}
              />
            </SheetCard>
          );
        })}
        <label className="mt-2 text-sm font-semibold text-ink" htmlFor="request-notes">
          Note for the store (optional)
        </label>
        <input
          id="request-notes"
          className="input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          placeholder="e.g. Needed for Hulhumalé jobs tomorrow"
        />
      </SheetBody>
    </WorkflowSheet>
  );
}
