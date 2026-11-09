"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { BarcodeScanDialog } from "@/components/app/barcode-scan-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { canonicalSerial, extractSerial, isOntItem, ponSerialsIn } from "@/lib/field/serial";
import {
  formatQuantity,
  newSlipKey,
  SERIAL_PATTERN,
  type InventoryItem,
  type SerialUnitRow,
  type StockRequest,
  type StockSummaryRow,
  type StockTechnician,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { AddItemPicker } from "./add-item-picker";
import { NoticeLine, ScanField, SerialChips, SerialText, type Notice } from "./serial-scan";

type Condition = "GOOD" | "FAULTY";

type IssueLine = {
  key: string;
  item: InventoryItem;
  quantity: string;
  unit: "CONSUMPTION" | "STOCK";
  serials: string[];
  /** Quantity the supervisor asked for, when fulfilling a request. */
  requested?: number;
};

/** Why the store can't issue a unit that is already registered, from the store's point of view. */
function unavailableReason(row: SerialUnitRow, item: InventoryItem): string | null {
  switch (row.status) {
    case "RETURNED":
      return row.item_code === item.code ? null : `registered as ${row.item_name}, not ${item.name}`;
    case "WITH_SUPERVISOR":
      return `already issued to ${row.technician_name ?? "a supervisor"}`;
    case "WITH_TECHNICIAN":
      return `already with ${row.technician_name ?? "a technician"}`;
    case "CONSUMED":
      return `already installed on SR ${row.sr_number ?? row.crm_ticket_id ?? "—"}`;
    default:
      return "was returned faulty and can't be issued";
  }
}

async function lookupSerial(serial: string): Promise<SerialUnitRow | null> {
  const { data } = await axiosInterceptorInstance.get<SerialUnitRow[]>(
    `/inventory/stock/serials?search=${encodeURIComponent(serial)}`,
  );
  return (data ?? []).find((row) => row.serial_number === serial) ?? null;
}

/** A PON SN anywhere in the scan wins; otherwise the best-looking serial. */
function readSerial(raw: string) {
  return ponSerialsIn(raw)[0] ?? extractSerial(raw) ?? canonicalSerial(raw);
}
type ReturnLine = {
  key: string;
  holding: StockSummaryRow;
  quantity: string;
  serials: string[];
  condition: Condition;
};

function lineKey() {
  return Math.random().toString(36).slice(2, 10);
}

function HolderSelect({
  label,
  holders,
  value,
  onChange,
  disabled,
}: {
  label: string;
  holders: StockTechnician[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="stock-holder">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="stock-holder" aria-label={label}>
          <SelectValue placeholder={`Choose a ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {holders.map((holder) => (
            <SelectItem key={holder.id} value={holder.id}>
              {holder.name}
              {holder.kind === "SUPERVISOR" ? " · Supervisor" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!holders.length && (
        <p className="text-xs text-muted-foreground">
          No active supervisor accounts yet. Create one under Users with the Supervisor role.
        </p>
      )}
    </div>
  );
}

export function IssueStockDialog({
  open,
  technicians,
  defaultTechnician,
  request,
  onClose,
  onDone,
}: {
  open: boolean;
  technicians: StockTechnician[];
  defaultTechnician?: string;
  /** Prefills the supervisor and items, and closes the request on success. */
  request?: StockRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const supervisors = technicians.filter((holder) => holder.kind === "SUPERVISOR");
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [technician, setTechnician] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<IssueLine[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  /** Serials the registry says can't be issued, with the reason. */
  const [flags, setFlags] = React.useState<Record<string, string>>({});
  const [notices, setNotices] = React.useState<Record<string, Notice>>({});
  const [cameraLine, setCameraLine] = React.useState<string | null>(null);
  const slipKey = React.useRef(newSlipKey("iss"));
  // Scanners fire faster than React re-renders; read the latest lines from here.
  const linesRef = React.useRef(lines);
  linesRef.current = lines;

  React.useEffect(() => {
    if (!open) return;
    const fallback = supervisors.some((holder) => holder.id === defaultTechnician) ? defaultTechnician : "";
    setTechnician(request?.requested_by_user_id ?? fallback ?? "");
    setReference("");
    setNotes(request?.notes ? `Request: ${request.notes}` : "");
    setLines([]);
    setFlags({});
    setNotices({});
    setCameraLine(null);
    setPickerOpen(false);
    setShowErrors(false);
    slipKey.current = newSlipKey("iss");
    axiosInterceptorInstance
      .get<InventoryItem[]>("/inventory/items")
      .then((response) => {
        const catalog = response.data ?? [];
        setItems(catalog);
        if (!request) return;
        setLines(
          request.lines.flatMap((wanted) => {
            const item = catalog.find((candidate) => candidate.id === wanted.item_id);
            return item
              ? [
                  {
                    key: lineKey(),
                    item,
                    quantity: item.serialized ? "" : String(wanted.quantity),
                    unit: "CONSUMPTION" as const,
                    serials: [],
                    requested: wanted.quantity,
                  },
                ]
              : [];
          }),
        );
      })
      .catch(() => toast.error("Couldn't load the item list."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTechnician, request]);

  const errors = lines.map((line) => {
    if (line.item.serialized) {
      if (!line.serials.length) return "Scan the serial number of every unit";
      const flagged = line.serials.filter((serial) => flags[serial]);
      if (flagged.length) {
        return `Remove ${flagged.map((serial) => `${serial} (${flags[serial]})`).join(" · ")}`;
      }
      return "";
    }
    const value = Number(line.quantity);
    if (!(value > 0)) return "Enter a quantity greater than zero";
    const converted = line.unit === "STOCK" ? value * line.item.conversion_factor : value;
    if (!line.item.allow_decimal && !Number.isInteger(Math.round(converted * 100) / 100)) {
      return `Counted in whole ${line.item.consumption_uom.toLowerCase()}s`;
    }
    return "";
  });
  const invalid = !technician || !lines.length || errors.some(Boolean);

  function addItem(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setLines((list) => [
      ...list,
      { key: lineKey(), item, quantity: item.serialized ? "" : "1", unit: "CONSUMPTION", serials: [] },
    ]);
  }

  function update(key: string, patch: Partial<IssueLine>) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    slipKey.current = newSlipKey("iss");
  }

  function addSerial(key: string, raw: string) {
    const say = (notice: Notice) => setNotices((current) => ({ ...current, [key]: notice }));
    const target = linesRef.current.find((line) => line.key === key);
    if (!target) return;
    const ont = isOntItem(target.item);
    const serial = ont ? ponSerialsIn(raw)[0] : readSerial(raw);
    if (!serial) {
      say({
        ok: false,
        text: `"${raw.trim().slice(0, 40)}" is not a PON SN. Scan the barcode marked PON SN or SN (e.g. 48575443686AEC86), not the MAC or device code.`,
      });
      return;
    }
    if (!SERIAL_PATTERN.test(serial)) {
      say({ ok: false, text: `"${raw}" doesn't look like a serial number` });
      return;
    }
    const holder = linesRef.current.find((line) => line.serials.includes(serial));
    if (holder) {
      say(
        holder.key === key
          ? { ok: true, text: `${serial} is already on the list (${holder.serials.length} scanned)` }
          : { ok: false, text: `${serial} is already on this slip under ${holder.item.name}` },
      );
      return;
    }
    linesRef.current = linesRef.current.map((line) =>
      line.key === key ? { ...line, serials: [...line.serials, serial] } : line,
    );
    setLines(linesRef.current);
    slipKey.current = newSlipKey("iss");
    const count = target.serials.length + 1;
    say({
      ok: true,
      text: `Added ${serial} · ${count}${target.requested ? ` of ${target.requested} requested` : ` unit${count === 1 ? "" : "s"}`}`,
    });
    lookupSerial(serial)
      .then((row) => {
        const problem = row ? unavailableReason(row, target.item) : null;
        if (!problem) return;
        setFlags((current) => ({ ...current, [serial]: problem }));
        say({ ok: false, text: `${serial} ${problem}` });
      })
      .catch(() => undefined);
  }

  function removeSerial(key: string, serial: string) {
    setLines((list) =>
      list.map((line) => (line.key === key ? { ...line, serials: line.serials.filter((other) => other !== serial) } : line)),
    );
    setFlags(({ [serial]: _removed, ...rest }) => rest);
    slipKey.current = newSlipKey("iss");
  }

  const cameraTarget = lines.find((line) => line.key === cameraLine);
  const lastSerialLine = lines.filter((line) => line.item.serialized).at(-1)?.key;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await axiosInterceptorInstance.post("/inventory/stock/issue", {
        technician_user_id: technician,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotency_key: slipKey.current,
        request_id: request?.id,
        lines: lines.map((line) =>
          line.item.serialized
            ? { item_id: line.item.id, serial_numbers: line.serials }
            : { item_id: line.item.id, quantity: Number(line.quantity), unit: line.unit },
        ),
      });
      const name = supervisors.find((holder) => holder.id === technician)?.name ?? "supervisor";
      toast.success(`Issued ${lines.length} item${lines.length === 1 ? "" : "s"} to ${name}`);
      onClose();
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't issue the items."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(event) => {
          if (pickerOpen) {
            event.preventDefault();
            setPickerOpen(false);
          }
        }}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-6 py-4 pr-12">
            <DialogTitle>{request ? `Fulfil ${request.requested_by_name}'s request` : "Issue items to a supervisor"}</DialogTitle>
            <DialogDescription>
              Supervisors hand these items out to their technicians. Scan each ONT box with a handheld scanner or the
              camera so every unit is tracked from the store to the customer.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <HolderSelect
                label="Supervisor"
                holders={supervisors}
                value={technician}
                onChange={setTechnician}
                disabled={busy || Boolean(request)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="issue-ref">Slip / reference (optional)</Label>
                <Input
                  id="issue-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. ISS-2026-0142"
                  maxLength={80}
                />
              </div>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const error = showErrors ? errors[index] : "";
                const serials = line.serials;
                const converts = !line.item.serialized && line.item.conversion_factor !== 1;
                return (
                  <div key={line.key} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{line.item.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{line.item.code}</div>
                      </div>
                      {line.item.serialized && <Badge variant="info">Serial required</Badge>}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${line.item.name}`}
                        onClick={() => setLines((list) => list.filter((other) => other.key !== line.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {line.item.serialized ? (
                      <div className="space-y-2">
                        <Label htmlFor={`serials-${line.key}`}>
                          Serial numbers · {serials.length}
                          {line.requested ? ` of ${line.requested} requested` : ` unit${serials.length === 1 ? "" : "s"}`}
                        </Label>
                        <ScanField
                          id={`serials-${line.key}`}
                          autoFocus
                          captureKeys={line.key === lastSerialLine}
                          ponOnly={isOntItem(line.item)}
                          disabled={busy}
                          onScan={(raw) => addSerial(line.key, raw)}
                          onCamera={() => setCameraLine(line.key)}
                        />
                        <NoticeLine notice={notices[line.key]} />
                        <SerialChips
                          serials={serials}
                          flags={flags}
                          onRemove={(serial) => removeSerial(line.key, serial)}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`qty-${line.key}`}>Quantity</Label>
                          <Input
                            id={`qty-${line.key}`}
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0.01"
                            className="w-32"
                            value={line.quantity}
                            onChange={(e) => update(line.key, { quantity: e.target.value })}
                            aria-invalid={Boolean(error)}
                          />
                        </div>
                        {converts ? (
                          <Select
                            value={line.unit}
                            onValueChange={(unit) => update(line.key, { unit: unit as IssueLine["unit"] })}
                          >
                            <SelectTrigger className="w-44" aria-label="Unit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CONSUMPTION">{line.item.consumption_uom}</SelectItem>
                              <SelectItem value="STOCK">{line.item.stock_uom}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="pb-2 text-sm text-muted-foreground">{line.item.consumption_uom}</span>
                        )}
                        {converts && line.unit === "STOCK" && Number(line.quantity) > 0 && (
                          <span className="pb-2 text-xs text-muted-foreground">
                            = {formatQuantity(Number(line.quantity) * line.item.conversion_factor, line.item.consumption_uom)}
                          </span>
                        )}
                      </div>
                    )}
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                );
              })}

              <AddItemPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                label={lines.length ? "Add another item" : "Add item"}
                disabled={busy}
                options={items
                  .filter((item) => !lines.some((line) => line.item.id === item.id))
                  .map((item) => ({
                    id: item.id,
                    label: item.name,
                    code: item.code,
                    group: item.category,
                    serialized: item.serialized,
                  }))}
                onPick={addItem}
              />
              {showErrors && !lines.length && <p className="text-xs text-destructive">Add at least one item.</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-notes">Notes (optional)</Label>
              <Input id="issue-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {request ? "Issue and close request" : "Issue items"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <BarcodeScanDialog
        open={Boolean(cameraTarget)}
        ponOnly={cameraTarget ? isOntItem(cameraTarget.item) : true}
        title={cameraTarget ? `Scan ${cameraTarget.item.name} · ${cameraTarget.serials.length} scanned` : "Scan"}
        status={cameraLine ? <NoticeLine notice={notices[cameraLine]} /> : null}
        onClose={() => setCameraLine(null)}
        onScanned={(serial) => cameraLine && addSerial(cameraLine, serial)}
      />
    </Dialog>
  );
}

export function ReturnStockDialog({
  open,
  technicians,
  defaultTechnician,
  onClose,
  onDone,
}: {
  open: boolean;
  technicians: StockTechnician[];
  defaultTechnician?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [technician, setTechnician] = React.useState("");
  const [holdings, setHoldings] = React.useState<StockSummaryRow[]>([]);
  const [serials, setSerials] = React.useState<SerialUnitRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [lines, setLines] = React.useState<ReturnLine[]>([]);
  const [notes, setNotes] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [camera, setCamera] = React.useState(false);
  const slipKey = React.useRef(newSlipKey("ret"));
  const linesRef = React.useRef(lines);
  linesRef.current = lines;

  React.useEffect(() => {
    if (!open) return;
    setTechnician(defaultTechnician ?? "");
    setNotes("");
    setPickerOpen(false);
    setShowErrors(false);
    setCamera(false);
    slipKey.current = newSlipKey("ret");
  }, [open, defaultTechnician]);

  React.useEffect(() => {
    setLines([]);
    setNotice(null);
    setHoldings([]);
    setSerials([]);
    if (!open || !technician) return;
    setLoading(true);
    Promise.all([
      axiosInterceptorInstance.get<{ rows: StockSummaryRow[] }>(`/inventory/stock/summary?technician_ids=${technician}`),
      axiosInterceptorInstance.get<SerialUnitRow[]>(`/inventory/stock/serials?technician_ids=${technician}`),
    ])
      .then(([summary, units]) => {
        setHoldings(
          (summary.data.rows ?? []).filter((row) => row.technician_user_id === technician && row.in_hand > 0),
        );
        setSerials(
          (units.data ?? []).filter((unit) => unit.status === "WITH_SUPERVISOR" || unit.status === "WITH_TECHNICIAN"),
        );
      })
      .catch(() => toast.error("Couldn't load what they hold."))
      .finally(() => setLoading(false));
  }, [open, technician]);

  const errors = lines.map((line) => {
    if (line.holding.serialized) return line.serials.length ? "" : "Tick the serials being returned";
    const value = Number(line.quantity);
    const others = lines
      .filter((other) => other.key !== line.key && other.holding.item_id === line.holding.item_id)
      .reduce((sum, other) => sum + (Number(other.quantity) || 0), 0);
    if (!(value > 0)) return "Enter a quantity greater than zero";
    if (value + others > line.holding.in_hand) {
      return `Only ${formatQuantity(line.holding.in_hand, line.holding.uom)} held`;
    }
    return "";
  });
  const invalid = !technician || !lines.length || errors.some(Boolean);
  const chosenSerials = new Set(lines.flatMap((line) => line.serials));

  function addHolding(itemId: string) {
    const holding = holdings.find((row) => row.item_id === itemId);
    if (!holding) return;
    setLines((list) => [
      ...list,
      { key: lineKey(), holding, quantity: holding.serialized ? "" : String(holding.in_hand), serials: [], condition: "GOOD" },
    ]);
  }

  function update(key: string, patch: Partial<ReturnLine>) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    slipKey.current = newSlipKey("ret");
  }

  const holderName = technicians.find((holder) => holder.id === technician)?.name ?? "this person";
  const hasSerialized = holdings.some((row) => row.serialized);

  /** A scanned box ticks its serial, adding the item line if it isn't on the slip yet. */
  function scanReturn(raw: string) {
    const serial = readSerial(raw);
    if (!SERIAL_PATTERN.test(serial)) {
      setNotice({ ok: false, text: `"${raw}" doesn't look like a serial number` });
      return;
    }
    const unit = serials.find((candidate) => candidate.serial_number === serial);
    const holding = unit && holdings.find((row) => row.item_code === unit.item_code);
    if (!unit || !holding) {
      setNotice({ ok: false, text: `${serial} is not held by ${holderName}` });
      lookupSerial(serial)
        .then((row) =>
          setNotice({
            ok: false,
            text: row
              ? `${serial} (${row.item_name}) is not held by ${holderName}: ${
                  row.status === "WITH_SUPERVISOR" || row.status === "WITH_TECHNICIAN"
                    ? `it is with ${row.technician_name ?? "someone else"}`
                    : row.status === "CONSUMED"
                      ? `installed on SR ${row.sr_number ?? row.crm_ticket_id ?? "—"}`
                      : "it is already in the store"
                }`
              : `${serial} was never issued from the store`,
          }),
        )
        .catch(() => undefined);
      return;
    }
    if (linesRef.current.some((line) => line.serials.includes(serial))) {
      setNotice({ ok: true, text: `${serial} is already on the return` });
      return;
    }
    const existing = linesRef.current.find((line) => line.holding.item_id === holding.item_id);
    linesRef.current = existing
      ? linesRef.current.map((line) => (line === existing ? { ...line, serials: [...line.serials, serial] } : line))
      : [...linesRef.current, { key: lineKey(), holding, quantity: "", serials: [serial], condition: "GOOD" }];
    setLines(linesRef.current);
    slipKey.current = newSlipKey("ret");
    setNotice({ ok: true, text: `Added ${holding.item_name} · ${serial}` });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await axiosInterceptorInstance.post("/inventory/stock/return", {
        technician_user_id: technician,
        notes: notes.trim() || undefined,
        idempotency_key: slipKey.current,
        lines: lines.map((line) =>
          line.holding.serialized
            ? { item_id: line.holding.item_id, serial_numbers: line.serials, condition: line.condition }
            : { item_id: line.holding.item_id, quantity: Number(line.quantity), condition: line.condition },
        ),
      });
      toast.success("Return recorded");
      onClose();
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't record the return."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        onEscapeKeyDown={(event) => {
          if (pickerOpen) {
            event.preventDefault();
            setPickerOpen(false);
          }
        }}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-6 py-4 pr-12">
            <DialogTitle>Record a return</DialogTitle>
            <DialogDescription>
              Items a supervisor or technician hands back to the store. Good items can be issued again; faulty ones are
              kept apart.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            <HolderSelect
              label="Returned by"
              holders={technicians}
              value={technician}
              onChange={setTechnician}
              disabled={busy}
            />

            {technician && (
              <div className="space-y-3">
                {loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading what they hold…
                  </p>
                ) : !holdings.length ? (
                  <p className="text-sm text-muted-foreground">They hold no issued stock.</p>
                ) : null}

                {!loading && hasSerialized && (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <Label htmlFor="return-scan">Scan returned ONTs / serial items</Label>
                    <ScanField
                      id="return-scan"
                      autoFocus
                      captureKeys
                      disabled={busy}
                      onScan={scanReturn}
                      onCamera={() => setCamera(true)}
                    />
                    <NoticeLine notice={notice} />
                  </div>
                )}

                {lines.map((line, index) => {
                  const error = showErrors ? errors[index] : "";
                  const available = serials.filter(
                    (unit) =>
                      unit.item_code === line.holding.item_code &&
                      (line.serials.includes(unit.serial_number) || !chosenSerials.has(unit.serial_number)),
                  );
                  return (
                    <div key={line.key} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{line.holding.item_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Holds {formatQuantity(line.holding.in_hand, line.holding.uom)}
                          </div>
                        </div>
                        <Select value={line.condition} onValueChange={(value) => update(line.key, { condition: value as Condition })}>
                          <SelectTrigger className="w-32" aria-label="Condition">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GOOD">Good</SelectItem>
                            <SelectItem value="FAULTY">Faulty</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${line.holding.item_name}`}
                          onClick={() => setLines((list) => list.filter((other) => other.key !== line.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {line.holding.serialized ? (
                        <div className="flex flex-wrap gap-2">
                          {available.map((unit) => {
                            const checked = line.serials.includes(unit.serial_number);
                            return (
                              <label
                                key={unit.serial_number}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-xs",
                                  checked && "border-primary bg-accent",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    update(line.key, {
                                      serials: checked
                                        ? line.serials.filter((serial) => serial !== unit.serial_number)
                                        : [...line.serials, unit.serial_number],
                                    })
                                  }
                                />
                                <SerialText serial={unit.serial_number} />
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`ret-${line.key}`}>Quantity returned</Label>
                            <Input
                              id={`ret-${line.key}`}
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0.01"
                              className="w-32"
                              value={line.quantity}
                              onChange={(e) => update(line.key, { quantity: e.target.value })}
                              aria-invalid={Boolean(error)}
                            />
                          </div>
                          <span className="pb-2 text-sm text-muted-foreground">{line.holding.uom}</span>
                        </div>
                      )}
                      {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                  );
                })}

                {holdings.length > 0 && (
                  <AddItemPicker
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    label={lines.length ? "Add another returned item" : "Add returned item"}
                    placeholder="Search what they hold…"
                    disabled={busy}
                    options={holdings.map((row) => ({
                      id: row.item_id,
                      label: row.item_name,
                      code: row.item_code,
                      hint: `Holds ${formatQuantity(row.in_hand, row.uom)}`,
                      serialized: row.serialized,
                    }))}
                    onPick={addHolding}
                  />
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="return-notes">Notes (optional)</Label>
              <Input
                id="return-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. ONT dead on arrival"
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !holdings.length}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Record return
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <BarcodeScanDialog
        open={camera}
        title={`Scan returns from ${holderName}`}
        status={<NoticeLine notice={notice} />}
        onClose={() => setCamera(false)}
        onScanned={scanReturn}
      />
    </Dialog>
  );
}
