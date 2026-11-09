"use client";

import * as React from "react";
import { toast } from "sonner";
import { Camera, Check, Loader2, Search } from "lucide-react";
import { BarcodeScanDialog } from "@/components/app/barcode-scan-dialog";
import { ScanButton } from "@/components/app/scan-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import axiosInterceptorInstance, { apiErrorMessage } from "@/lib/axios-interceptor";
import { canonicalSerial, extractSerial, normalizeSerial, ponSerialsIn } from "@/lib/field/serial";
import {
  formatQuantity,
  newSlipKey,
  type InventoryItem,
  type SerialUnitRow,
  type StockSummaryRow,
  type StockTechnician,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import type { MyStock } from "@/types/field-workflow";
import { NoticeLine, SerialText, type Notice } from "./serial-scan";

export type HandoverMode = "handout" | "takeback";

type PoolItem = { id: string; name: string; uom: string; serialized: boolean; in_hand: number; serials: string[] };

const COPY: Record<HandoverMode, { title: string; description: string; confirm: string; endpoint: string }> = {
  handout: {
    title: "Hand out to a technician",
    description:
      "ONTs of the same model look identical, so the serial on each box decides which unit is recorded. Scan the boxes you are handing over, or tick them below.",
    confirm: "Confirm hand-out",
    endpoint: "/inventory/stock/handout",
  },
  takeback: {
    title: "Take back from a technician",
    description: "Unused, good items go back into your stock. Faulty items are returned to the store by the inventory team.",
    confirm: "Confirm take-back",
    endpoint: "/inventory/stock/take-back",
  },
};

function whereIs(row: SerialUnitRow) {
  switch (row.status) {
    case "WITH_SUPERVISOR":
      return `is with ${row.technician_name ?? "another supervisor"} (supervisor)`;
    case "WITH_TECHNICIAN":
      return `is with ${row.technician_name ?? "another technician"}`;
    case "CONSUMED":
      return `is already installed on SR ${row.sr_number ?? row.crm_ticket_id ?? "—"}`;
    case "RETURNED":
      return "is in the store. Ask the store to issue it to you first";
    default:
      return "was returned as faulty";
  }
}

export function HandoverDialog({
  open,
  mode,
  technicians,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: HandoverMode;
  technicians: StockTechnician[];
  onClose: () => void;
  onDone: () => void;
}) {
  const copy = COPY[mode];
  const techs = technicians.filter((holder) => holder.kind === "TECHNICIAN");
  const [technician, setTechnician] = React.useState("");
  const [pool, setPool] = React.useState<PoolItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [typed, setTyped] = React.useState("");
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [camera, setCamera] = React.useState(false);
  const [review, setReview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const slipKey = React.useRef(newSlipKey(mode));
  const scanInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setTechnician("");
    setSelected([]);
    setQuantities({});
    setFilters({});
    setTyped("");
    setNotice(null);
    setReview(false);
    setPool(null);
  }, [open, mode]);

  React.useEffect(() => {
    if (!open) return;
    setSelected([]);
    setQuantities({});
    if (mode === "handout") {
      setLoading(true);
      axiosInterceptorInstance
        .get<MyStock>("/inventory/stock/mine")
        .then((response) =>
          setPool(
            (response.data?.items ?? []).map((entry) => ({
              id: entry.item.id,
              name: entry.item.name,
              uom: entry.item.consumption_uom,
              serialized: entry.item.serialized,
              in_hand: entry.in_hand,
              serials: entry.serials.map((unit) => unit.serial_number),
            })),
          ),
        )
        .catch(() => {
          setPool([]);
          toast.error("Couldn't load your stock.");
        })
        .finally(() => setLoading(false));
      return;
    }
    setPool(null);
    if (!technician) return;
    setLoading(true);
    Promise.all([
      axiosInterceptorInstance.get<{ rows: StockSummaryRow[] }>(`/inventory/stock/summary?technician_ids=${technician}`),
      axiosInterceptorInstance.get<SerialUnitRow[]>(
        `/inventory/stock/serials?technician_ids=${technician}&status=WITH_TECHNICIAN`,
      ),
    ])
      .then(([summary, units]) =>
        setPool(
          (summary.data.rows ?? [])
            .filter((row) => row.technician_user_id === technician && row.in_hand > 0)
            .map((row) => ({
              id: row.item_id,
              name: row.item_name,
              uom: row.uom,
              serialized: row.serialized,
              in_hand: row.in_hand,
              serials: (units.data ?? []).filter((unit) => unit.item_code === row.item_code).map((unit) => unit.serial_number),
            })),
        ),
      )
      .catch(() => {
        setPool([]);
        toast.error("Couldn't load what this technician holds.");
      })
      .finally(() => setLoading(false));
  }, [open, mode, technician]);

  const techName = techs.find((tech) => tech.id === technician)?.name ?? "the technician";
  const ownerText = mode === "handout" ? "your stock" : `${techName}'s stock`;
  const hasSerialized = Boolean(pool?.some((item) => item.serialized));
  const lines = (pool ?? []).flatMap((item) => {
    if (item.serialized) {
      const serials = selected.filter((serial) => item.serials.includes(serial));
      return serials.length ? [{ item, serials, quantity: serials.length }] : [];
    }
    const quantity = Number(quantities[item.id]);
    return quantity > 0 ? [{ item, serials: [] as string[], quantity }] : [];
  });
  const overdrawn = lines.some((line) => !line.item.serialized && line.quantity > line.item.in_hand);
  const count = lines.reduce((sum, line) => sum + (line.item.serialized ? line.quantity : 1), 0);

  async function addSerial(raw: string) {
    const serial = ponSerialsIn(raw)[0] ?? extractSerial(raw) ?? canonicalSerial(raw);
    if (!serial) return;
    const item = pool?.find((candidate) => candidate.serials.includes(serial));
    if (item) {
      setSelected((list) => (list.includes(serial) ? list : [...list, serial]));
      setNotice({
        ok: true,
        text: selected.includes(serial) ? `${serial} is already on the list` : `Added ${item.name} · ${serial}`,
      });
      return;
    }
    setNotice({ ok: false, text: `${serial} is not in ${ownerText}` });
    try {
      const { data } = await axiosInterceptorInstance.get<SerialUnitRow[]>(
        `/inventory/stock/serials?search=${encodeURIComponent(serial)}`,
      );
      const match = (data ?? []).find((row) => row.serial_number === serial);
      setNotice({
        ok: false,
        text: match
          ? `${serial} (${match.item_name}) ${whereIs(match)}`
          : `${serial} is not registered. Ask the store to issue it first`,
      });
    } catch {
      // Keep the first message.
    }
  }

  async function submit() {
    if (!technician || !lines.length || busy) return;
    setBusy(true);
    try {
      await axiosInterceptorInstance.post(copy.endpoint, {
        technician_user_id: technician,
        idempotency_key: slipKey.current,
        lines: lines.map((line) =>
          line.item.serialized
            ? { item_id: line.item.id, serial_numbers: line.serials }
            : { item_id: line.item.id, quantity: line.quantity },
        ),
      });
      toast.success(
        mode === "handout"
          ? `Handed ${count} item${count === 1 ? "" : "s"} to ${techName}`
          : `Took back ${count} item${count === 1 ? "" : "s"} from ${techName}`,
      );
      onClose();
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't save the hand-over."));
    } finally {
      setBusy(false);
    }
  }

  const showPool = mode === "handout" || Boolean(technician);

  return (
    <>
      <Dialog open={open && !camera} onOpenChange={(next) => !next && !busy && onClose()}>
        <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4 pr-12">
            <DialogTitle>{review ? "Check before you confirm" : copy.title}</DialogTitle>
            <DialogDescription>
              {review
                ? mode === "handout"
                  ? `These go to ${techName}. They can only install the exact serials listed.`
                  : `These come back from ${techName} into your stock.`
                : copy.description}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            {review ? (
              lines.map((line) => (
                <div key={line.item.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{line.item.name}</span>
                    <Badge variant="brand">{formatQuantity(line.quantity, line.item.uom)}</Badge>
                  </div>
                  {line.serials.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {line.serials.map((serial) => (
                        <span key={serial} className="rounded-md border px-2 py-1">
                          <SerialText serial={serial} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="handover-tech">Technician</Label>
                  <Select value={technician} onValueChange={setTechnician} disabled={busy}>
                    <SelectTrigger id="handover-tech" aria-label="Technician">
                      <SelectValue placeholder={techs.length ? "Choose a technician" : "No active technicians"} />
                    </SelectTrigger>
                    <SelectContent>
                      {techs.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!showPool ? null : loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading stock…
                  </p>
                ) : !pool?.length ? (
                  <p className="text-sm text-muted-foreground">
                    {mode === "handout"
                      ? "You hold no stock to hand out. Use Request stock to ask the store."
                      : "This technician holds no stock."}
                  </p>
                ) : (
                  <>
                    {hasSerialized && (
                      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                        <Label htmlFor="handover-scan">Scan ONT boxes</Label>
                        <form
                          className="flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void addSerial(typed);
                            setTyped("");
                            scanInput.current?.focus();
                          }}
                        >
                          <Input
                            id="handover-scan"
                            ref={scanInput}
                            autoFocus
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            placeholder="Scan with a barcode scanner, or type the serial"
                            className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <Button type="submit" variant="outline" disabled={!typed.trim()}>
                            Add
                          </Button>
                          <ScanButton
                            multiple
                            className={buttonVariants({ variant: "outline" })}
                            onLiveCamera={() => setCamera(true)}
                            onSerials={(serials) => serials.forEach((serial) => void addSerial(serial))}
                          >
                            {(reading) => (
                              <>
                                {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                Scan
                              </>
                            )}
                          </ScanButton>
                        </form>
                        <NoticeLine notice={notice} />
                      </div>
                    )}

                    {pool.map((item) => {
                      if (!item.serialized) {
                        const value = quantities[item.id] ?? "";
                        const tooMuch = Number(value) > item.in_hand;
                        return (
                          <div key={item.id} className="space-y-1.5 rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {mode === "handout" ? "You hold" : "Holds"} {formatQuantity(item.in_hand, item.uom)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  className="w-28 text-right"
                                  value={value}
                                  placeholder="0"
                                  aria-invalid={tooMuch}
                                  aria-label={`${item.name} quantity`}
                                  onChange={(event) => setQuantities((all) => ({ ...all, [item.id]: event.target.value }))}
                                />
                                <span className="text-sm text-muted-foreground">{item.uom}</span>
                              </div>
                            </div>
                            {tooMuch && (
                              <p className="text-xs text-destructive">Only {formatQuantity(item.in_hand, item.uom)} available</p>
                            )}
                          </div>
                        );
                      }
                      const picked = selected.filter((serial) => item.serials.includes(serial)).length;
                      const needle = normalizeSerial(filters[item.id]);
                      const shown = needle ? item.serials.filter((serial) => serial.includes(needle)) : item.serials;
                      return (
                        <div key={item.id} className="space-y-2 rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{item.name}</span>
                            <Badge variant={picked ? "brand" : "secondary"}>
                              {picked} of {item.serials.length} selected
                            </Badge>
                          </div>
                          {item.serials.length > 6 && (
                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={filters[item.id] ?? ""}
                                onChange={(event) => setFilters((all) => ({ ...all, [item.id]: event.target.value }))}
                                placeholder="Find by last digits"
                                aria-label={`Find ${item.name} serial`}
                                className="pl-9 font-mono uppercase placeholder:font-sans placeholder:normal-case"
                              />
                            </div>
                          )}
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {shown.map((serial) => {
                              const on = selected.includes(serial);
                              return (
                                <button
                                  key={serial}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={on}
                                  onClick={() =>
                                    setSelected((list) =>
                                      on ? list.filter((value) => value !== serial) : [...list, serial],
                                    )
                                  }
                                  className={cn(
                                    "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                                    on ? "border-primary bg-accent" : "hover:bg-muted",
                                  )}
                                >
                                  <SerialText serial={serial} />
                                  {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </button>
                              );
                            })}
                            {!shown.length && (
                              <p className="text-xs text-muted-foreground">No serial matches “{filters[item.id]}”.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">
            {review ? (
              <>
                <Button type="button" variant="outline" onClick={() => setReview(false)} disabled={busy}>
                  Back
                </Button>
                <Button type="button" onClick={submit} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {copy.confirm}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!technician || !count || overdrawn}
                  onClick={() => {
                    slipKey.current = newSlipKey(mode);
                    setReview(true);
                  }}
                >
                  {count ? `Review ${count} item${count === 1 ? "" : "s"}` : "Review"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanDialog
        open={open && camera}
        title={selected.length ? `Scanning · ${selected.length} added` : "Scan ONT boxes"}
        status={<NoticeLine notice={notice} />}
        onClose={() => setCamera(false)}
        onScanned={(serial) => void addSerial(serial)}
      />
    </>
  );
}

/** Supervisor asks the store for more stock; the store issues against the request. */
export function RequestStockDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [held, setHeld] = React.useState<Map<string, number>>(new Map());
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setQuantities({});
    setSearch("");
    setNotes("");
    Promise.all([
      axiosInterceptorInstance.get<InventoryItem[]>("/inventory/items"),
      axiosInterceptorInstance.get<MyStock>("/inventory/stock/mine"),
    ])
      .then(([catalog, mine]) => {
        setItems(catalog.data ?? []);
        setHeld(new Map((mine.data?.items ?? []).map((entry) => [entry.item.id, entry.in_hand])));
      })
      .catch(() => toast.error("Couldn't load the item list."));
  }, [open]);

  const needle = search.trim().toLowerCase();
  const shown = items.filter(
    (item) => !needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle),
  );
  const wholeOnly = (item: InventoryItem) => item.serialized || !item.allow_decimal;
  const lines = items.flatMap((item) => {
    const quantity = Number(quantities[item.id]);
    return quantity > 0 ? [{ item, quantity }] : [];
  });
  const invalid = lines.some(({ item, quantity }) => wholeOnly(item) && !Number.isInteger(quantity));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!lines.length || invalid || busy) return;
    setBusy(true);
    try {
      await axiosInterceptorInstance.post("/inventory/stock/requests", {
        lines: lines.map(({ item, quantity }) => ({ item_id: item.id, quantity })),
        notes: notes.trim() || undefined,
      });
      toast.success("Request sent to the store");
      onClose();
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-6 py-4 pr-12">
            <DialogTitle>Request stock</DialogTitle>
            <DialogDescription>The inventory team sees this request and issues the items to you.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items"
                className="pl-9"
              />
            </div>
            {shown.map((item) => {
              const value = quantities[item.id] ?? "";
              const wrong = Number(value) > 0 && wholeOnly(item) && !Number.isInteger(Number(value));
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      You hold {formatQuantity(held.get(item.id) ?? 0, item.consumption_uom)}
                    </div>
                    {wrong && <div className="text-xs text-destructive">Whole numbers only</div>}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step={wholeOnly(item) ? "1" : "0.01"}
                    className="w-28 shrink-0 text-right"
                    value={value}
                    placeholder="0"
                    aria-invalid={wrong}
                    aria-label={`${item.name} quantity`}
                    onChange={(event) => setQuantities((all) => ({ ...all, [item.id]: event.target.value }))}
                  />
                </div>
              );
            })}
            <div className="space-y-1.5">
              <Label htmlFor="request-notes">Note for the store (optional)</Label>
              <Input
                id="request-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                placeholder="e.g. Needed for Hulhumalé jobs tomorrow"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !lines.length || invalid}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {lines.length ? `Send request · ${lines.length} item${lines.length === 1 ? "" : "s"}` : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
