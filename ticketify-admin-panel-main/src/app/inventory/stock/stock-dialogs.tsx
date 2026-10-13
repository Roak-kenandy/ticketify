"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  formatQuantity,
  newSlipKey,
  parseSerials,
  SERIAL_PATTERN,
  type InventoryItem,
  type SerialUnitRow,
  type StockSummaryRow,
  type StockTechnician,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";

const textareaClass =
  "flex min-h-[96px] w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm uppercase shadow-sm placeholder:normal-case placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive";

type Condition = "GOOD" | "FAULTY";

type IssueLine = { key: string; item: InventoryItem; quantity: string; unit: "CONSUMPTION" | "STOCK"; serials: string };
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

function serialProblems(serials: string[], others: Set<string>) {
  const seen = new Set<string>();
  const problems = new Map<string, string>();
  for (const serial of serials) {
    if (!SERIAL_PATTERN.test(serial)) problems.set(serial, "Not a valid serial");
    else if (seen.has(serial) || others.has(serial)) problems.set(serial, "Listed twice");
    seen.add(serial);
  }
  return problems;
}

function TechnicianSelect({
  technicians,
  value,
  onChange,
  disabled,
}: {
  technicians: StockTechnician[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="stock-tech">Technician</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="stock-tech" aria-label="Technician">
          <SelectValue placeholder="Choose a technician" />
        </SelectTrigger>
        <SelectContent>
          {technicians.map((tech) => (
            <SelectItem key={tech.id} value={tech.id}>
              {tech.name}
              {tech.role && tech.role.toLowerCase() !== "technician" ? ` · ${tech.role}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function IssueStockDialog({
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
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [technician, setTechnician] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<IssueLine[]>([]);
  const [picker, setPicker] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const slipKey = React.useRef(newSlipKey("iss"));

  React.useEffect(() => {
    if (!open) return;
    setTechnician(defaultTechnician ?? "");
    setReference("");
    setNotes("");
    setLines([]);
    setShowErrors(false);
    slipKey.current = newSlipKey("iss");
    axiosInterceptorInstance
      .get<InventoryItem[]>("/inventory/items")
      .then((response) => setItems(response.data ?? []))
      .catch(() => toast.error("Couldn't load the item list."));
  }, [open, defaultTechnician]);

  const errors = lines.map((line, index) => {
    if (line.item.serialized) {
      const serials = parseSerials(line.serials);
      const earlier = new Set(
        lines.slice(0, index).flatMap((other) => (other.item.serialized ? parseSerials(other.serials) : [])),
      );
      const problems = serialProblems(serials, earlier);
      if (!serials.length) return "Enter the serial number of every unit";
      if (problems.size) return [...problems].map(([serial, problem]) => `${serial}: ${problem}`).join(" · ");
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
    setPicker("");
    if (!item) return;
    setLines((list) => [
      ...list,
      { key: lineKey(), item, quantity: item.serialized ? "" : "1", unit: "CONSUMPTION", serials: "" },
    ]);
  }

  function update(key: string, patch: Partial<IssueLine>) {
    setLines((list) => list.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    slipKey.current = newSlipKey("iss");
  }

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
        lines: lines.map((line) =>
          line.item.serialized
            ? { item_id: line.item.id, serial_numbers: parseSerials(line.serials) }
            : { item_id: line.item.id, quantity: Number(line.quantity), unit: line.unit },
        ),
      });
      const name = technicians.find((tech) => tech.id === technician)?.name ?? "technician";
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
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Issue items to a technician</DialogTitle>
            <DialogDescription>
              The technician can only record these items on their tickets. Devices such as ONTs need the serial number of
              every unit.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <TechnicianSelect technicians={technicians} value={technician} onChange={setTechnician} disabled={busy} />
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
              const serials = line.item.serialized ? parseSerials(line.serials) : [];
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
                    <div className="space-y-1.5">
                      <Label htmlFor={`serials-${line.key}`}>
                        Serial numbers · {serials.length} unit{serials.length === 1 ? "" : "s"}
                      </Label>
                      <textarea
                        id={`serials-${line.key}`}
                        className={textareaClass}
                        value={line.serials}
                        onChange={(e) => update(line.key, { serials: e.target.value })}
                        placeholder="Scan or type one serial per line"
                        aria-invalid={Boolean(error)}
                        spellCheck={false}
                        autoCapitalize="characters"
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

            <Select value={picker} onValueChange={addItem}>
              <SelectTrigger aria-label="Add item" className="border-dashed">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  Add item
                </span>
              </SelectTrigger>
              <SelectContent>
                {items
                  .filter((item) => !lines.some((line) => line.item.id === item.id))
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                      {item.serialized ? " · serial" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {showErrors && !lines.length && <p className="text-xs text-destructive">Add at least one item.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-notes">Notes (optional)</Label>
            <Input id="issue-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue items
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
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
  const [picker, setPicker] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const slipKey = React.useRef(newSlipKey("ret"));

  React.useEffect(() => {
    if (!open) return;
    setTechnician(defaultTechnician ?? "");
    setNotes("");
    setShowErrors(false);
    slipKey.current = newSlipKey("ret");
  }, [open, defaultTechnician]);

  React.useEffect(() => {
    setLines([]);
    setHoldings([]);
    setSerials([]);
    if (!open || !technician) return;
    setLoading(true);
    Promise.all([
      axiosInterceptorInstance.get<{ rows: StockSummaryRow[] }>(`/inventory/stock/summary?technician_ids=${technician}`),
      axiosInterceptorInstance.get<SerialUnitRow[]>(
        `/inventory/stock/serials?technician_ids=${technician}&status=WITH_TECHNICIAN`,
      ),
    ])
      .then(([summary, units]) => {
        setHoldings((summary.data.rows ?? []).filter((row) => row.in_hand > 0));
        setSerials(units.data ?? []);
      })
      .catch(() => toast.error("Couldn't load what this technician holds."))
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
    setPicker("");
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
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record a return</DialogTitle>
            <DialogDescription>
              Items the technician hands back. Good items go back to the store; faulty ones are kept apart and can&apos;t be
              issued again.
            </DialogDescription>
          </DialogHeader>

          <TechnicianSelect technicians={technicians} value={technician} onChange={setTechnician} disabled={busy} />

          {technician && (
            <div className="space-y-3">
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading what they hold…
                </p>
              ) : !holdings.length ? (
                <p className="text-sm text-muted-foreground">This technician holds no issued stock.</p>
              ) : null}

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
                              {unit.serial_number}
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
                <Select value={picker} onValueChange={addHolding}>
                  <SelectTrigger aria-label="Add returned item" className="border-dashed">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Plus className="h-4 w-4" />
                      Add returned item
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {holdings.map((row) => (
                      <SelectItem key={row.item_id} value={row.item_id}>
                        {row.item_name} · holds {formatQuantity(row.in_hand, row.uom)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          <DialogFooter className="gap-2 sm:gap-0">
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
    </Dialog>
  );
}
