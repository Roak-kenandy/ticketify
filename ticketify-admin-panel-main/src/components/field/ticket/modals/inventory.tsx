"use client";

import {
  Box,
  CheckCircle2,
  Loader2,
  Lock,
  MinusCircle,
  Minus,
  Plus,
  PlusCircle,
  Radio,
  ScanLine,
  Search,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import React from "react";
import { PrimaryButton, SecondaryButton } from "@/components/field/ui/button";
import { Prompt } from "@/components/field/ui/prompt";
import SerialScanner from "@/components/field/ui/serial-scanner";
import { EmptyState, ErrorState, InlineBanner } from "@/components/field/ui/state-views";
import WorkflowSheet, {
  Fact,
  newIdempotencyKey,
  SectionTitle,
  SheetBody,
  SheetCard,
  SheetCenter,
} from "@/components/field/ui/workflow-sheet";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showSuccess } from "@/lib/field/notify";
import { isValidSerial, normalizeSerial } from "@/lib/field/serial";
import { useSession } from "@/lib/field/session";
import type { InventoryItem, InventoryLine, TicketInventory } from "@/types/field-workflow";

type Declaration = "USED" | "NONE_USED";

type Draft = {
  key: string;
  item: InventoryItem;
  quantity: string;
  serial: string;
  remarks: string;
  remarksOpen?: boolean;
  provisioningTransactionId?: string;
  source?: string;
};

type DraftErrors = { quantity?: string; serial?: string; remarks?: string };

const MAX_QUANTITY = 100000;

export default function InventoryModal({
  visible,
  ticketId,
  srNumber,
  technicianName,
  onClose,
  onChanged,
}: {
  visible: boolean;
  ticketId: string;
  srNumber?: string | null;
  technicianName?: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { token } = useSession();
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [inventory, setInventory] = React.useState<TicketInventory | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [declaration, setDeclaration] = React.useState<Declaration | null>(null);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [picking, setPicking] = React.useState(false);
  const [scanFor, setScanFor] = React.useState<string | null>(null);
  const [reversing, setReversing] = React.useState<InventoryLine | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const idempotencyKey = React.useRef(newIdempotencyKey("inv"));

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [itemList, current]: [InventoryItem[], TicketInventory] = await Promise.all([
        apiGet("/inventory/items", token),
        apiGet(`/inventory/tickets/${ticketId}`, token),
      ]);
      setItems(itemList);
      setInventory(current);
      const byId = new Map(itemList.map((item) => [item.id, item]));
      const proposed = current.proposed_lines.flatMap((line) => {
        const item = byId.get(line.item_id);
        return item
          ? [
              {
                key: `p-${line.provisioning_transaction_id}`,
                item,
                quantity: String(line.quantity),
                serial: line.serial_number,
                remarks: "",
                provisioningTransactionId: line.provisioning_transaction_id,
                source: line.reason,
              },
            ]
          : [];
      });
      setDrafts(proposed);
      setDeclaration(proposed.length ? "USED" : (current.declaration?.type ?? null));
    } catch (err: any) {
      setLoadError(err?.message || "Could not load inventory");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  React.useEffect(() => {
    if (visible) {
      setPicking(false);
      setShowErrors(false);
      load();
    }
  }, [visible, load]);

  React.useEffect(() => {
    idempotencyKey.current = newIdempotencyKey("inv");
  }, [drafts, declaration]);

  const postedLines = React.useMemo(() => inventory?.lines.filter((line) => line.status === "POSTED") ?? [], [inventory]);
  const locked = Boolean(inventory?.locked);
  const takenSerials = React.useMemo(
    () => new Set(postedLines.map((line) => line.serial_number).filter((serial): serial is string => Boolean(serial))),
    [postedLines],
  );

  const errors = React.useMemo(() => {
    const result: Record<string, DraftErrors> = {};
    const seen = new Set<string>();
    for (const draft of drafts) {
      const entry: DraftErrors = {};
      if (!draft.item.serialized) {
        entry.quantity = quantityError(draft.item, draft.quantity);
      } else {
        const serial = normalizeSerial(draft.serial);
        if (!serial) {
          entry.serial = "Scan or enter the serial number";
        } else if (!isValidSerial(serial)) {
          entry.serial = "Not a valid serial number";
        } else if (seen.has(serial) || takenSerials.has(serial)) {
          entry.serial = "This serial is already on this ticket";
        }
        seen.add(serial);
      }
      if (draft.item.remarks_required && !draft.remarks.trim()) {
        entry.remarks = "A remark is required for this item";
      }
      if (entry.quantity || entry.serial || entry.remarks) {
        result[draft.key] = entry;
      }
    }
    return result;
  }, [drafts, takenSerials]);

  const currentType = inventory?.declaration?.type ?? null;
  const hasChanges =
    declaration !== null &&
    (drafts.length > 0 || declaration !== currentType) &&
    !(declaration === "USED" && !drafts.length && !postedLines.length);
  const canSubmit = !locked && hasChanges && !submitting && !(declaration === "NONE_USED" && postedLines.length);

  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  const addItem = (item: InventoryItem) => {
    setPicking(false);
    setDeclaration("USED");
    if (!item.serialized && drafts.some((d) => d.item.id === item.id)) {
      return;
    }
    const key = `d-${Date.now().toString(36)}`;
    setDrafts((list) => [
      ...list,
      { key, item, quantity: item.serialized ? "1" : item.allow_decimal ? "" : "1", serial: "", remarks: "" },
    ]);
    if (item.serialized) {
      setScanFor(key);
    }
  };

  const review = () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      showError("Fix the highlighted items first");
      return;
    }
    if (declaration === "USED" && drafts.length) {
      setReviewing(true);
      return;
    }
    submit();
  };

  const submit = async () => {
    setReviewing(false);
    setSubmitting(true);
    try {
      const result: TicketInventory = await apiPost(
        `/inventory/tickets/${ticketId}/declaration`,
        {
          declaration,
          idempotency_key: idempotencyKey.current,
          lines:
            declaration === "USED"
              ? drafts.map((draft) => ({
                  item_id: draft.item.id,
                  quantity: draft.item.serialized ? 1 : parseQuantity(draft.quantity),
                  serial_number: draft.item.serialized ? normalizeSerial(draft.serial) : undefined,
                  remarks: draft.remarks.trim() || undefined,
                  provisioning_transaction_id: draft.provisioningTransactionId,
                }))
              : [],
        },
        token,
      );
      setInventory(result);
      setDrafts([]);
      setShowErrors(false);
      showSuccess(
        declaration === "NONE_USED"
          ? "Recorded: no inventory used"
          : drafts.length
            ? `${drafts.length} item${drafts.length === 1 ? "" : "s"} recorded`
            : "Inventory declaration saved",
      );
      onChanged();
    } catch (err: any) {
      showError(err?.message || "Could not save inventory");
    } finally {
      setSubmitting(false);
    }
  };

  const onReversed = (result: TicketInventory) => {
    setInventory(result);
    setReversing(null);
    showSuccess("Line reversed");
    onChanged();
  };

  return (
    <WorkflowSheet
      visible={visible}
      title={picking ? "Add item" : "Inventory used"}
      subtitle={srNumber ? `Ticket #${srNumber}` : null}
      onClose={onClose}
      onBack={picking ? () => setPicking(false) : undefined}
      footer={
        inventory && !locked && !picking ? (
          <>
            <SecondaryButton text="Close" onClick={onClose} className="flex-1" />
            <PrimaryButton
              text={submitLabel(declaration, drafts.length, hasChanges)}
              onClick={review}
              loading={submitting}
              disabled={!canSubmit}
              className="flex-1"
            />
          </>
        ) : null
      }
    >
      {picking ? (
        <ItemPicker items={items} onPick={addItem} />
      ) : loading && !inventory ? (
        <SheetCenter>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-gray2">Loading inventory…</p>
        </SheetCenter>
      ) : loadError && !inventory ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : inventory ? (
        <SheetBody>
          <SheetCard>
            <Fact label="SR number" value={inventory.header?.sr_number ?? srNumber} />
            <Fact label="Customer" value={inventory.header?.customer_name} />
            <Fact label="Terminal node" value={inventory.header?.terminal_node_id} />
            <Fact label="Technician" value={technicianName} />
            <Fact label="Department" value={inventory.header?.department} />
            <Fact label="Service type" value={inventory.header?.service_type} />
          </SheetCard>
          {locked ? (
            <InlineBanner tone="info" icon={Lock} message="This ticket is closed. Ask the inventory team for any correction." />
          ) : (
            <p className="text-sm leading-5 text-gray2">
              Record every item used on this job, or confirm none was used. This is required before the ticket can be
              closed.
            </p>
          )}

          {!locked ? (
            <div className="flex gap-3" role="radiogroup">
              <ChoiceTile
                icon={Box}
                title="Items used"
                selected={declaration === "USED"}
                onClick={() => setDeclaration("USED")}
              />
              <ChoiceTile
                icon={MinusCircle}
                title="No inventory used"
                selected={declaration === "NONE_USED"}
                disabled={postedLines.length > 0 || drafts.length > 0}
                onClick={() => setDeclaration("NONE_USED")}
              />
            </div>
          ) : null}
          {!locked && postedLines.length > 0 ? (
            <p className="text-xs text-gray2">Items are already recorded. Reverse them to declare no inventory used.</p>
          ) : null}

          {inventory.lines.length > 0 ? (
            <>
              <SectionTitle>Recorded on this ticket</SectionTitle>
              <div className="rounded-lg border border-borderlight bg-white px-4">
                {inventory.lines.map((line, index) => (
                  <PostedRow
                    key={line.id}
                    line={line}
                    first={index === 0}
                    onReverse={!locked && line.status === "POSTED" ? () => setReversing(line) : undefined}
                  />
                ))}
              </div>
            </>
          ) : currentType === "NONE_USED" ? (
            <InlineBanner tone="info" icon={CheckCircle2} message="Declared: no inventory used on this job." />
          ) : null}

          {!locked && declaration === "USED" ? (
            <>
              <SectionTitle>{postedLines.length ? "Add more items" : "Items to record"}</SectionTitle>
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.key}
                  draft={draft}
                  errors={showErrors ? errors[draft.key] : undefined}
                  onChange={(patch) => updateDraft(draft.key, patch)}
                  onScan={() => setScanFor(draft.key)}
                  onRemove={() => setDrafts((list) => list.filter((d) => d.key !== draft.key))}
                />
              ))}
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-white py-3.5 text-[15px] font-semibold text-primary"
              >
                <PlusCircle className="h-5 w-5" />
                Add item
              </button>
            </>
          ) : null}
        </SheetBody>
      ) : null}

      <SerialScanner
        visible={scanFor !== null}
        onClose={() => setScanFor(null)}
        onScanned={(serial) => {
          if (scanFor) {
            updateDraft(scanFor, { serial });
          }
          setScanFor(null);
        }}
      />
      <Prompt
        open={reviewing}
        title="Review consumption"
        lead="These items will be posted against this ticket."
        onCancel={() => setReviewing(false)}
        actions={
          <>
            <SecondaryButton text="Edit" onClick={() => setReviewing(false)} className="flex-1" />
            <PrimaryButton text="Confirm and post" onClick={submit} className="flex-1" />
          </>
        }
      >
        {drafts.map((draft, index) => (
          <div key={draft.key} className={cn("py-3", index > 0 && "border-t border-borderlight")}>
            <p className="line-clamp-2 text-sm font-semibold text-ink">{draft.item.name}</p>
            <p className="mt-0.5 text-xs text-gray2">
              {draft.item.serialized
                ? `1 ${draft.item.consumption_uom}  ·  SN ${normalizeSerial(draft.serial)}`
                : formatQuantity(parseQuantity(draft.quantity), draft.item.consumption_uom)}
            </p>
            {draft.remarks.trim() ? <p className="mt-0.5 text-xs text-gray2">{draft.remarks.trim()}</p> : null}
          </div>
        ))}
      </Prompt>
      <ReversePrompt line={reversing} onCancel={() => setReversing(null)} onDone={onReversed} />
    </WorkflowSheet>
  );
}

function parseQuantity(text: string): number {
  return Number(text.replace(",", ".").trim());
}

function quantityError(item: InventoryItem, text: string): string | undefined {
  if (!text.trim()) {
    return "Enter the quantity used";
  }
  const value = parseQuantity(text);
  if (!Number.isFinite(value) || value <= 0) {
    return "Quantity must be greater than zero";
  }
  if (value > MAX_QUANTITY) {
    return "Quantity is too large";
  }
  const decimals = (String(text).replace(",", ".").split(".")[1] ?? "").length;
  if (!item.allow_decimal && !Number.isInteger(value)) {
    return `Use whole ${item.consumption_uom.toLowerCase()}`;
  }
  if (decimals > 2) {
    return "Use at most 2 decimal places";
  }
  return undefined;
}

function formatQuantity(value: number, uom: string) {
  return `${Number(value.toFixed(2))} ${uom}`;
}

function submitLabel(declaration: Declaration | null, count: number, hasChanges: boolean) {
  if (declaration === "NONE_USED") {
    return "Confirm none used";
  }
  if (count) {
    return `Record ${count} item${count === 1 ? "" : "s"}`;
  }
  return hasChanges ? "Save" : "Saved";
}

function ChoiceTile({
  icon: Icon,
  title,
  selected,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-lg border-[1.5px] py-4",
        selected ? "border-primary bg-tertiary/35" : "border-borderlight bg-white",
        disabled && "opacity-45",
      )}
    >
      <Icon className={cn("h-6 w-6", selected ? "text-primary" : "text-gray2")} />
      <span className={cn("text-sm font-semibold", selected ? "text-primary" : "text-gray2")}>{title}</span>
    </button>
  );
}

function PostedRow({ line, first, onReverse }: { line: InventoryLine; first: boolean; onReverse?: () => void }) {
  const reversed = line.status === "REVERSED";
  return (
    <div className={cn("flex items-center gap-3 py-3", !first && "border-t border-borderlight")}>
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 text-sm font-semibold text-ink", reversed && "text-gray3 line-through")}>
          {line.item_name}
        </p>
        <p className="mt-0.5 text-xs text-gray2">
          {formatQuantity(reversed ? line.quantity : line.effective_quantity, line.uom)}
          {line.serial_number ? `  ·  SN ${line.serial_number}` : ""}
        </p>
        {reversed || line.adjusted ? (
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold",
              reversed ? "bg-error-bg text-error" : "bg-warning-bg text-warning",
            )}
          >
            {reversed ? "Reversed" : "Adjusted by inventory team"}
          </span>
        ) : null}
      </div>
      {onReverse ? (
        <button
          type="button"
          onClick={onReverse}
          aria-label={`Reverse ${line.item_name}`}
          className="text-[13px] font-bold text-error"
        >
          Reverse
        </button>
      ) : null}
    </div>
  );
}

function DraftCard({
  draft,
  errors,
  onChange,
  onScan,
  onRemove,
}: {
  draft: Draft;
  errors?: DraftErrors;
  onChange: (patch: Partial<Draft>) => void;
  onScan: () => void;
  onRemove: () => void;
}) {
  const { item } = draft;
  const fromProvisioning = Boolean(draft.provisioningTransactionId);
  const step = (delta: number) => {
    const next = Math.max(1, Math.round((parseQuantity(draft.quantity) || 0) + delta));
    onChange({ quantity: String(next) });
  };

  return (
    <SheetCard>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">{item.name}</p>
          <p className="mt-0.5 text-xs text-gray2">
            {item.category} · {item.consumption_uom}
          </p>
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`}>
          <Trash2 className="h-5 w-5 text-gray2" />
        </button>
      </div>
      {draft.source ? (
        <div className="flex items-center gap-1.5 self-start rounded-full bg-info-bg px-2.5 py-1">
          <Radio className="h-3.5 w-3.5 text-info" />
          <span className="text-xs font-semibold text-info">{draft.source}</span>
        </div>
      ) : null}

      {item.serialized ? (
        <>
          <span className="caption">Serial number · 1 unit</span>
          <div className="flex gap-2">
            <input
              className={cn("input flex-1 font-mono uppercase", errors?.serial && "border-error")}
              value={draft.serial}
              onChange={(event) => onChange({ serial: event.target.value })}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              readOnly={fromProvisioning}
              placeholder="Scan or type serial"
            />
            {!fromProvisioning ? (
              <button
                type="button"
                onClick={onScan}
                aria-label="Scan serial"
                className="flex h-12 w-12 items-center justify-center rounded-md bg-primary"
              >
                <ScanLine className="h-[22px] w-[22px] text-white" />
              </button>
            ) : null}
          </div>
          {errors?.serial ? <p className="text-xs text-error">{errors.serial}</p> : null}
        </>
      ) : item.allow_decimal ? (
        <>
          <span className="caption">Quantity used</span>
          <div className="flex items-center gap-3">
            <input
              className={cn("input w-32", errors?.quantity && "border-error")}
              value={draft.quantity}
              onChange={(event) => onChange({ quantity: event.target.value.replace(/[^0-9.,]/g, "") })}
              inputMode="decimal"
              placeholder="0.00"
            />
            <span className="text-sm font-semibold text-gray2">{item.consumption_uom}</span>
          </div>
          {errors?.quantity ? (
            <p className="text-xs text-error">{errors.quantity}</p>
          ) : (
            <p className="text-xs text-gray2">Decimals allowed, e.g. 12.5</p>
          )}
        </>
      ) : (
        <>
          <span className="caption">Quantity used</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Decrease"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-tertiary text-primary"
            >
              <Minus className="h-[18px] w-[18px]" />
            </button>
            <input
              className={cn(
                "h-10 w-16 rounded-md border bg-white text-center text-base font-semibold text-ink outline-none",
                errors?.quantity ? "border-error" : "border-borderlight",
              )}
              value={draft.quantity}
              onChange={(event) => onChange({ quantity: event.target.value.replace(/[^0-9]/g, "") })}
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Increase"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-tertiary text-primary"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
            <span className="text-sm font-semibold text-gray2">{item.consumption_uom}</span>
          </div>
          {errors?.quantity ? <p className="text-xs text-error">{errors.quantity}</p> : null}
        </>
      )}

      {item.remarks_required || draft.remarksOpen ? (
        <>
          <span className="caption">Remarks{item.remarks_required ? " (required)" : ""}</span>
          <input
            className={cn("input", errors?.remarks && "border-error")}
            value={draft.remarks}
            onChange={(event) => onChange({ remarks: event.target.value })}
            placeholder="Why / where it was used"
            maxLength={500}
          />
          {errors?.remarks ? <p className="text-xs text-error">{errors.remarks}</p> : null}
        </>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ remarksOpen: true })}
          className="self-start text-[13px] font-semibold text-primary"
        >
          + Add remark
        </button>
      )}
    </SheetCard>
  );
}

function ItemPicker({ items, onPick }: { items: InventoryItem[]; onPick: (item: InventoryItem) => void }) {
  const [query, setQuery] = React.useState("");
  const sections = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = items.filter(
      (item) =>
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
    const groups = new Map<string, InventoryItem[]>();
    for (const item of matches) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return Array.from(groups, ([title, data]) => ({ title, data }));
  }, [items, query]);

  return (
    <div className="flex flex-col">
      <div className="m-4 flex items-center gap-2 rounded-lg border border-borderlight bg-white px-3">
        <Search className="h-[18px] w-[18px] text-gray2" />
        <input
          type="search"
          className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-gray3 [&::-webkit-search-cancel-button]:hidden"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items, codes or categories"
          autoCorrect="off"
          autoFocus
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
            <XCircle className="h-[18px] w-[18px] text-gray3" />
          </button>
        ) : null}
      </div>
      <div className="px-4 pb-8">
        {sections.length === 0 ? (
          <EmptyState compact icon={Search} title="No matching items" message="Try a different name or code." />
        ) : (
          sections.map((section) => (
            <div key={section.title}>
              <h3 className="pb-2 pt-3 text-xs font-bold uppercase tracking-wide text-primary">{section.title}</h3>
              <div className="flex flex-col gap-2">
                {section.data.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item)}
                    className="flex items-center gap-3 rounded-lg border border-borderlight bg-white p-3 text-left active:bg-surface"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-gray2">
                        {item.code} · {item.consumption_uom}
                      </span>
                    </span>
                    {item.serialized ? (
                      <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-bold text-info">Serial</span>
                    ) : item.allow_decimal ? (
                      <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning">
                        Decimal
                      </span>
                    ) : null}
                    <Plus className="h-5 w-5 text-primary" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReversePrompt({
  line,
  onCancel,
  onDone,
}: {
  line: InventoryLine | null;
  onCancel: () => void;
  onDone: (result: TicketInventory) => void;
}) {
  const { token } = useSession();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setReason("");
  }, [line]);

  const confirm = async () => {
    if (!line) {
      return;
    }
    setBusy(true);
    try {
      onDone(await apiPost(`/inventory/consumptions/${line.id}/reverse`, { reason: reason.trim() }, token));
    } catch (err: any) {
      showError(err?.message || "Could not reverse this line");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Prompt
      open={line !== null}
      title="Reverse this line?"
      lead={
        line
          ? `${line.item_name} · ${formatQuantity(line.effective_quantity, line.uom)}${
              line.serial_number ? ` · SN ${line.serial_number}` : ""
            }\nThe line stays in the history marked as reversed.`
          : undefined
      }
      onCancel={onCancel}
      actions={
        <>
          <SecondaryButton text="Cancel" onClick={onCancel} className="flex-1" />
          <PrimaryButton
            text="Reverse"
            onClick={confirm}
            loading={busy}
            disabled={reason.trim().length < 3}
            className="flex-1"
          />
        </>
      }
    >
      <textarea
        className="textarea min-h-[88px]"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason, e.g. wrong item selected"
        maxLength={500}
        autoFocus
      />
    </Prompt>
  );
}
