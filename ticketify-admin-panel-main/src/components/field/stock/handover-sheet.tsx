"use client";

import { Check, CircleAlert, CircleCheck, ScanLine, Search } from "lucide-react";
import React from "react";
import { PrimaryButton, SecondaryButton } from "@/components/field/ui/button";
import SerialScanner from "@/components/field/ui/serial-scanner";
import WorkflowSheet, {
  Fact,
  SectionTitle,
  SelectInput,
  SheetBody,
  SheetCard,
  SheetCenter,
  newIdempotencyKey,
} from "@/components/field/ui/workflow-sheet";
import { apiGet, apiPost } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { showError, showSuccess } from "@/lib/field/notify";
import { extractSerial, normalizeSerial } from "@/lib/field/serial";
import { useSession } from "@/lib/field/session";
import type { MyStock } from "@/types/field-workflow";

export type HandoverMode = "handout" | "takeback";

type PoolItem = {
  id: string;
  name: string;
  uom: string;
  serialized: boolean;
  in_hand: number;
  serials: string[];
};

type Holder = { id: string; name: string; kind: "SUPERVISOR" | "TECHNICIAN" };

type SerialRow = {
  serial_number: string;
  item_code: string;
  item_name: string;
  status: "WITH_SUPERVISOR" | "WITH_TECHNICIAN" | "CONSUMED" | "RETURNED" | "FAULTY";
  technician_name: string | null;
  sr_number: string | null;
  crm_ticket_id: string | null;
};

type SummaryRow = {
  technician_user_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  serialized: boolean;
  in_hand: number;
};

type Notice = { ok: boolean; text: string };

const COPY: Record<HandoverMode, { title: string; confirm: string; done: string; endpoint: string }> = {
  handout: {
    title: "Hand out to technician",
    confirm: "Confirm hand-out",
    done: "Handed",
    endpoint: "/inventory/stock/handout",
  },
  takeback: {
    title: "Take back from technician",
    confirm: "Confirm take-back",
    done: "Took back",
    endpoint: "/inventory/stock/take-back",
  },
};

function amount(value: number, uom: string) {
  return `${Number(value.toFixed(2))} ${uom}`;
}

function whereIs(row: SerialRow) {
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
      return "was returned as faulty and can't be handed out";
  }
}

/** Box labels are long; people match the last digits, so those are emphasised. */
function SerialText({ serial }: { serial: string }) {
  const cut = Math.max(0, serial.length - 4);
  return (
    <span className="font-mono text-[13px]">
      <span className="opacity-70">{serial.slice(0, cut)}</span>
      <span className="font-bold">{serial.slice(cut)}</span>
    </span>
  );
}

export default function HandoverSheet({
  visible,
  mode,
  myStock,
  onClose,
  onDone,
}: {
  visible: boolean;
  mode: HandoverMode;
  /** The supervisor's own stock (the source for a hand-out). */
  myStock: MyStock | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useSession();
  const copy = COPY[mode];
  const [technicians, setTechnicians] = React.useState<Holder[]>([]);
  const [technicianId, setTechnicianId] = React.useState<string | null>(null);
  const [theirStock, setTheirStock] = React.useState<PoolItem[] | null>(null);
  const [loadingPool, setLoadingPool] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [typed, setTyped] = React.useState("");
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [scanRound, setScanRound] = React.useState(0);
  const [review, setReview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const slipKey = React.useRef(newIdempotencyKey(mode));

  React.useEffect(() => {
    if (!visible) return;
    setTechnicianId(null);
    setTheirStock(null);
    setSelected([]);
    setQuantities({});
    setFilters({});
    setTyped("");
    setNotice(null);
    setReview(false);
    if (!token) return;
    apiGet("/inventory/stock/technicians", token, { silent: true })
      .then((rows: Holder[]) => setTechnicians((rows ?? []).filter((row) => row.kind === "TECHNICIAN")))
      .catch(() => setTechnicians([]));
  }, [visible, token]);

  React.useEffect(() => {
    setSelected([]);
    setQuantities({});
    setTheirStock(null);
    if (mode !== "takeback" || !technicianId || !token) return;
    setLoadingPool(true);
    Promise.all([
      apiGet(`/inventory/stock/summary?technician_ids=${technicianId}`, token, { silent: true }),
      apiGet(`/inventory/stock/serials?technician_ids=${technicianId}&status=WITH_TECHNICIAN`, token, {
        silent: true,
      }),
    ])
      .then(([summary, units]: [{ rows: SummaryRow[] }, SerialRow[]]) => {
        setTheirStock(
          (summary?.rows ?? [])
            .filter((row) => row.technician_user_id === technicianId && row.in_hand > 0)
            .map((row) => ({
              id: row.item_id,
              name: row.item_name,
              uom: row.uom,
              serialized: row.serialized,
              in_hand: row.in_hand,
              serials: (units ?? []).filter((unit) => unit.item_code === row.item_code).map((unit) => unit.serial_number),
            })),
        );
      })
      .catch(() => {
        setTheirStock([]);
        showError("Could not load what this technician holds");
      })
      .finally(() => setLoadingPool(false));
  }, [mode, technicianId, token]);

  const pool: PoolItem[] | null =
    mode === "takeback"
      ? theirStock
      : (myStock?.items ?? []).map((entry) => ({
          id: entry.item.id,
          name: entry.item.name,
          uom: entry.item.consumption_uom,
          serialized: entry.item.serialized,
          in_hand: entry.in_hand,
          serials: entry.serials.map((unit) => unit.serial_number),
        }));
  const technician = technicians.find((tech) => tech.id === technicianId);
  const ownerText = mode === "handout" ? "your stock" : `${technician?.name ?? "the technician"}'s stock`;
  const hasSerialized = Boolean(pool?.some((item) => item.serialized));

  const lines = (pool ?? []).flatMap((item) => {
    if (item.serialized) {
      const serials = selected.filter((serial) => item.serials.includes(serial));
      return serials.length ? [{ item, serials, quantity: serials.length }] : [];
    }
    const quantity = Number(quantities[item.id]);
    return quantity > 0 ? [{ item, serials: [] as string[], quantity }] : [];
  });
  const overdrawn = lines.find((line) => !line.item.serialized && line.quantity > line.item.in_hand);
  const count = lines.reduce((sum, line) => sum + (line.item.serialized ? line.quantity : 1), 0);

  function say(next: Notice) {
    setNotice(next);
    if (scanning) {
      (next.ok ? showSuccess : showError)(next.text);
    }
  }

  async function addSerial(raw: string) {
    const serial = extractSerial(raw) ?? normalizeSerial(raw);
    if (!serial) return;
    const item = pool?.find((candidate) => candidate.serials.includes(serial));
    if (item) {
      if (selected.includes(serial)) {
        say({ ok: true, text: `${serial} is already on the list` });
      } else {
        setSelected((list) => [...list, serial]);
        navigator.vibrate?.(40);
        say({ ok: true, text: `Added ${item.name} · ${serial}` });
      }
      return;
    }
    say({ ok: false, text: `${serial} is not in ${ownerText}` });
    try {
      const rows: SerialRow[] = await apiGet(
        `/inventory/stock/serials?search=${encodeURIComponent(serial)}`,
        token,
        { silent: true },
      );
      const match = (rows ?? []).find((row) => row.serial_number === serial);
      say({
        ok: false,
        text: match
          ? `${serial} (${match.item_name}) ${whereIs(match)}`
          : `${serial} is not registered. Ask the store to issue it first`,
      });
    } catch {
      // Keep the first message.
    }
  }

  function toggle(serial: string) {
    setSelected((list) => (list.includes(serial) ? list.filter((value) => value !== serial) : [...list, serial]));
  }

  async function submit() {
    if (!technicianId || !lines.length || busy) return;
    setBusy(true);
    try {
      await apiPost(
        copy.endpoint,
        {
          technician_user_id: technicianId,
          idempotency_key: slipKey.current,
          lines: lines.map((line) =>
            line.item.serialized
              ? { item_id: line.item.id, serial_numbers: line.serials }
              : { item_id: line.item.id, quantity: line.quantity },
          ),
        },
        token,
      );
      showSuccess(
        mode === "handout"
          ? `${copy.done} ${count} item${count === 1 ? "" : "s"} to ${technician?.name ?? "the technician"}`
          : `${copy.done} ${count} item${count === 1 ? "" : "s"} from ${technician?.name ?? "the technician"}`,
      );
      onDone();
      onClose();
    } catch (error: any) {
      showError(error?.message || "Could not save the hand-over");
    } finally {
      setBusy(false);
    }
  }

  const footer = review ? (
    <>
      <SecondaryButton text="Back" onClick={() => setReview(false)} disabled={busy} />
      <PrimaryButton text={copy.confirm} onClick={submit} loading={busy} />
    </>
  ) : (
    <PrimaryButton
      text={count ? `Review ${count} item${count === 1 ? "" : "s"}` : "Review"}
      disabled={!technicianId || !count || Boolean(overdrawn)}
      onClick={() => {
        slipKey.current = newIdempotencyKey(mode);
        setReview(true);
      }}
    />
  );

  return (
    <>
      <WorkflowSheet
        visible={visible}
        title={review ? "Check before you confirm" : copy.title}
        subtitle={review ? copy.title : mode === "handout" ? "From your stock" : "Unused, good items only"}
        onClose={busy ? () => undefined : onClose}
        onBack={review ? () => setReview(false) : undefined}
        footer={footer}
      >
        {review ? (
          <SheetBody>
            <SheetCard>
              <Fact label={mode === "handout" ? "Technician" : "From"} value={technician?.name} />
              <Fact label="Items" value={String(count)} />
            </SheetCard>
            {lines.map((line) => (
              <SheetCard key={line.item.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold text-ink">{line.item.name}</p>
                  <span className="text-sm font-bold text-primary">{amount(line.quantity, line.item.uom)}</span>
                </div>
                {line.serials.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {line.serials.map((serial) => (
                      <span key={serial} className="rounded-md border border-borderlight px-2 py-1">
                        <SerialText serial={serial} />
                      </span>
                    ))}
                  </div>
                ) : null}
              </SheetCard>
            ))}
            <p className="text-xs text-gray2">
              {mode === "handout"
                ? "These serials move to the technician. They can only install the exact ONTs listed here."
                : "These items go back into your stock and can be handed to another technician."}
            </p>
          </SheetBody>
        ) : (
          <SheetBody>
            <SheetCard>
              <label className="text-sm font-semibold text-ink">Technician</label>
              <SelectInput
                label="Technician"
                value={technicianId}
                placeholder={technicians.length ? "Choose a technician" : "No active technicians"}
                options={technicians.map((tech) => ({ value: tech.id, label: tech.name }))}
                onChange={setTechnicianId}
              />
            </SheetCard>

            {mode === "takeback" && !technicianId ? null : loadingPool ? (
              <SheetCenter>
                <p className="text-sm text-gray2">Loading what they hold…</p>
              </SheetCenter>
            ) : !pool?.length ? (
              <SheetCenter>
                <p className="text-sm text-gray2">
                  {mode === "handout"
                    ? "You have no stock to hand out. Request stock from the store."
                    : "This technician holds no stock."}
                </p>
              </SheetCenter>
            ) : (
              <>
                {hasSerialized ? (
                  <SheetCard>
                    <p className="text-sm font-semibold text-ink">Scan each ONT box</p>
                    <p className="text-xs text-gray2">
                      ONTs of the same model look identical, so the serial on the box decides which unit is recorded.
                      Scan the boxes you are handing over, or tap them in the lists below.
                    </p>
                    <PrimaryButton
                      text="Scan with camera"
                      icon={<ScanLine className="h-5 w-5" />}
                      onClick={() => {
                        setScanRound((round) => round + 1);
                        setScanning(true);
                      }}
                    />
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addSerial(typed);
                        setTyped("");
                      }}
                    >
                      <input
                        className="input flex-1 font-mono uppercase"
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        placeholder="Handheld scanner or type serial"
                        aria-label="Scan or type a serial number"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="submit"
                        disabled={!typed.trim()}
                        className="shrink-0 rounded-md border border-bordergray bg-white px-4 text-sm font-semibold text-primary disabled:opacity-50"
                      >
                        Add
                      </button>
                    </form>
                    {notice ? (
                      <p
                        role="status"
                        className={cn("flex items-start gap-1.5 text-[13px]", notice.ok ? "text-success" : "text-error")}
                      >
                        {notice.ok ? (
                          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        {notice.text}
                      </p>
                    ) : null}
                  </SheetCard>
                ) : null}

                <SectionTitle>{mode === "handout" ? "Your stock" : `${technician?.name ?? "Their"} stock`}</SectionTitle>
                {pool.map((item) => {
                  if (!item.serialized) {
                    const value = quantities[item.id] ?? "";
                    const tooMuch = Number(value) > item.in_hand;
                    return (
                      <SheetCard key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-semibold text-ink">{item.name}</p>
                            <p className="text-xs text-gray2">
                              {mode === "handout" ? "You hold" : "Holds"} {amount(item.in_hand, item.uom)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              className={cn("input w-24 text-right", tooMuch && "border-error")}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={value}
                              onChange={(event) => setQuantities((all) => ({ ...all, [item.id]: event.target.value }))}
                              placeholder="0"
                              aria-label={`${item.name} quantity`}
                            />
                            <span className="text-xs text-gray2">{item.uom}</span>
                          </div>
                        </div>
                        {tooMuch ? <p className="text-xs text-error">Only {amount(item.in_hand, item.uom)} available</p> : null}
                      </SheetCard>
                    );
                  }
                  const picked = selected.filter((serial) => item.serials.includes(serial)).length;
                  const needle = normalizeSerial(filters[item.id]);
                  const shown = needle ? item.serials.filter((serial) => serial.includes(needle)) : item.serials;
                  return (
                    <SheetCard key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[15px] font-semibold text-ink">{item.name}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
                            picked ? "bg-primary text-white" : "bg-tertiary text-primary",
                          )}
                        >
                          {picked} of {item.serials.length} selected
                        </span>
                      </div>
                      {item.serials.length > 6 ? (
                        <div className="input flex items-center gap-2">
                          <Search className="h-4 w-4 shrink-0 text-gray2" />
                          <input
                            className="h-full min-w-0 flex-1 bg-transparent font-mono uppercase outline-none"
                            value={filters[item.id] ?? ""}
                            onChange={(event) => setFilters((all) => ({ ...all, [item.id]: event.target.value }))}
                            placeholder="Find by last digits"
                            aria-label={`Find ${item.name} serial`}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>
                      ) : null}
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {shown.map((serial) => {
                          const on = selected.includes(serial);
                          return (
                            <button
                              key={serial}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              onClick={() => toggle(serial)}
                              className={cn(
                                "flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left",
                                on ? "border-primary bg-primary text-white" : "border-borderlight bg-white text-ink",
                              )}
                            >
                              <SerialText serial={serial} />
                              {on ? <Check className="h-4 w-4 shrink-0" /> : null}
                            </button>
                          );
                        })}
                        {!shown.length ? <p className="text-xs text-gray2">No serial matches “{filters[item.id]}”.</p> : null}
                      </div>
                    </SheetCard>
                  );
                })}
              </>
            )}
          </SheetBody>
        )}
      </WorkflowSheet>

      <SerialScanner
        key={scanRound}
        visible={scanning}
        title={selected.length ? `Scan next box · ${selected.length} added` : "Scan ONT box"}
        onClose={() => setScanning(false)}
        onScanned={(serial) => {
          void addSerial(serial);
          setScanRound((round) => round + 1);
        }}
      />
    </>
  );
}
