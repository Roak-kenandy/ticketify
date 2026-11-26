"use client";

import moment from "moment";
import { Loader2, RefreshCw, ScanLine, Search, SignalHigh } from "lucide-react";
import React from "react";
import { ScreenHeader } from "@/components/field/shell/headers";
import SerialScanner from "@/components/field/ui/serial-scanner";
import { EmptyState, InlineBanner } from "@/components/field/ui/state-views";
import { apiGet } from "@/lib/field/api";
import { cn } from "@/lib/field/cn";
import { fieldContainer } from "@/lib/field/layout";
import { isValidSerial, normalizeSerial } from "@/lib/field/serial";
import { useSession } from "@/lib/field/session";
import { shownOpticalLines } from "@/lib/field/optical-lines";
import type { OpticalReading } from "@/types/field-workflow";

type SignalStatus = {
  serial: string;
  range: { min_dbm: number; max_dbm: number };
  found: boolean;
  terminal_node_id: string | null;
  device: { registered: boolean; device_type: string | null; olt: string | null; pon: string | null } | null;
  reading: OpticalReading | null;
};

type History = {
  terminal_node_id: string | null;
  bandwidth: Array<{ at: string; services: Array<{ id: string; up: number; down: number }> }>;
  status: Array<{ at: string; services: Array<{ id: string; status: number }> }>;
  tr069: Array<{ label: string; value: string }>;
};

const TONES = {
  WITHIN_RANGE: { fg: "text-success", pill: "bg-success-bg text-success", text: "Within range" },
  OUTSIDE_RANGE: { fg: "text-error", pill: "bg-error-bg text-error", text: "Outside range" },
  NO_READING: { fg: "text-gray2", pill: "bg-surface text-gray2", text: "No reading" },
} as const;

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-borderlight py-2 text-sm first:border-t-0">
      <span className="text-gray2">{label}</span>
      <span className="text-right font-medium text-ink">{value ?? "—"}</span>
    </div>
  );
}

function ResultCard({ status, onRefresh, refreshing }: { status: SignalStatus; onRefresh: () => void; refreshing: boolean }) {
  const { reading, device, range } = status;
  const tone = TONES[reading?.result ?? "NO_READING"];
  const limit = Math.max(range.min_dbm, range.max_dbm);
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borderlight bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[15px] font-semibold text-ink">{status.serial}</p>
        <span className={cn("rounded-full px-3 py-1 text-xs font-bold", tone.pill)}>{tone.text}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-[40px] font-bold leading-none tabular-nums", tone.fg)}>{reading?.rx_dbm ?? "—"}</span>
        <span className="text-sm font-semibold text-gray2">dBm Rx</span>
      </div>
      <p className="text-xs text-gray2">
        Good at {limit} dBm or weaker. A stronger reading cannot close the ticket.
      </p>
      {!reading ? (
        <InlineBanner
          tone="warning"
          message={
            device
              ? "INCA has no optical reading for this ONT. Check that it is powered on and the fibre is connected."
              : "INCA doesn't know this serial. Check it and try again."
          }
        />
      ) : null}
      <div>
        {device ? (
          <>
            <Fact label="INCA record" value={device.registered ? "Registered" : "Not registered"} />
            <Fact label="Device type" value={device.device_type} />
            <Fact label="OLT / PON" value={[device.olt, device.pon].filter(Boolean).join(" · ") || null} />
          </>
        ) : null}
        {shownOpticalLines(reading?.details).map((line) => (
          <Fact key={line.label} label={line.label} value={line.value} />
        ))}
        {reading && !reading.details?.length ? (
          <>
            <Fact label="ONT Tx optical power (dBm)" value={reading.tx_dbm} />
            <Fact label="ONT Rx optical power (dBm)" value={reading.rx_dbm} />
          </>
        ) : null}
        {reading ? <Fact label="Read at" value={moment(reading.read_at).format("DD MMM, HH:mm:ss")} /> : null}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex h-11 items-center justify-center gap-2 rounded-md border border-bordergray text-sm font-semibold text-primary disabled:opacity-60"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        Read again
      </button>
    </section>
  );
}

function dayInput(offset: number) {
  return moment().add(offset, "days").format("YYYY-MM-DD");
}

function when(value: string) {
  const parsed = moment(value);
  return parsed.isValid() ? parsed.format("D MMM, HH:mm") : value;
}

function ServicePanel({ serial, token }: { serial: string; token: string | null }) {
  const [from, setFrom] = React.useState(dayInput(-7));
  const [to, setTo] = React.useState(dayInput(0));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [history, setHistory] = React.useState<History | null>(null);

  const load = React.useCallback(
    async (start: string, end: string) => {
      setLoading(true);
      setError("");
      try {
        const result: History = await apiGet(
          `/provisioning/signal/history?serial=${encodeURIComponent(serial)}&from=${start}&to=${end}`,
          token,
          { timeoutMs: 45_000 },
        );
        setHistory(result);
      } catch (err) {
        setHistory(null);
        setError(err instanceof Error ? err.message : "Couldn't read bandwidth and status from INCA.");
      } finally {
        setLoading(false);
      }
    },
    [serial, token],
  );

  React.useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-borderlight bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-ink">Bandwidth, status and ONU</p>
        <p className="mt-1 text-xs text-gray2">
          Pick the dates. Bandwidth is download and upload in MBit/s. Status stays a list of numbers. ONU details are the current reading.
        </p>
      </div>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load(from, to);
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray2">
          From
          <input className="input" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray2">
          To
          <input className="input" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button
          type="submit"
          disabled={loading || !from || !to}
          className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-md border border-bordergray text-sm font-semibold text-primary disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Reading…" : "Show this period"}
        </button>
      </form>
      {error ? <InlineBanner tone="error" message={error} /> : null}
      {history && !history.terminal_node_id ? (
        <InlineBanner tone="warning" message="This ONT is not on a Terminal Node, so bandwidth and status are not available." />
      ) : null}
      {history?.tr069.length ? (
        <div>
          <p className="mb-1 text-sm font-semibold text-ink">ONU</p>
          {history.tr069.map((fact) => (
            <Fact key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </div>
      ) : null}
      {history ? <BandwidthChart points={history.bandwidth} from={from} to={to} /> : null}
      {history ? (
        <NumberTable
          title="Status"
          empty="No status in this period."
          columns={["Hour", "Service", "Status"]}
          rows={history.status.flatMap((point) =>
            point.services.map((service) => [when(point.at), service.id, String(service.status)]),
          )}
        />
      ) : null}
    </section>
  );
}

/** INCA stores bit/s. 100736 is 0.101 MBit/s, which is how its bandwidth chart is scaled. */
function toMbps(bitsPerSecond: number) {
  return bitsPerSecond / 1_000_000;
}

function BandwidthChart({
  points,
  from,
  to,
}: {
  points: History["bandwidth"];
  from: string;
  to: string;
}) {
  const series = points
    .map((point) => ({
      at: point.at,
      down: toMbps(Math.max(0, ...point.services.map((service) => service.down), 0)),
      up: toMbps(Math.max(0, ...point.services.map((service) => service.up), 0)),
    }))
    .sort((a, b) => moment(a.at).valueOf() - moment(b.at).valueOf());
  const width = 320;
  const height = 180;
  const pad = { left: 36, right: 8, top: 12, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const peak = Math.max(0.01, ...series.map((point) => Math.max(point.down, point.up)));
  const yMax = niceMax(peak);
  const xAt = (index: number) =>
    pad.left + (series.length <= 1 ? plotW / 2 : (index / (series.length - 1)) * plotW);
  const yAt = (value: number) => pad.top + plotH - (value / yMax) * plotH;
  const downLine = series.map((point, index) => `${xAt(index)},${yAt(point.down)}`).join(" ");
  const upLine = series.map((point, index) => `${xAt(index)},${yAt(point.up)}`).join(" ");
  const downArea = series.length
    ? `${downLine} ${xAt(series.length - 1)},${yAt(0)} ${xAt(0)},${yAt(0)}`
    : "";
  const ticks = [0, yMax / 2, yMax];
  const labelAt = (index: number) => moment(series[index]?.at).format(series.length > 8 ? "D MMM" : "D MMM HH:mm");

  return (
    <div>
      <p className="text-sm font-semibold text-ink">Bandwidth</p>
      <p className="mt-1 text-center text-xs font-semibold text-ink">
        {moment(from).format("D MMM YYYY")} – {moment(to).format("D MMM YYYY")}
      </p>
      {series.length ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full" role="img" aria-label="Download and upload in megabits per second">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke="#ece7df" strokeWidth="1" />
                <text x={pad.left - 4} y={yAt(tick) + 3} textAnchor="end" fontSize="8" fill="#8a8175">
                  {tick >= 10 ? tick.toFixed(0) : tick.toFixed(tick >= 1 ? 1 : 3)}
                </text>
              </g>
            ))}
            <polygon points={downArea} fill="#f0a202" fillOpacity="0.85" />
            <polyline points={downLine} fill="none" stroke="#e09200" strokeWidth="1.5" />
            <polyline points={upLine} fill="none" stroke="#6b2d91" strokeWidth="1.5" />
            {[0, Math.floor((series.length - 1) / 2), series.length - 1]
              .filter((index, position, all) => all.indexOf(index) === position)
              .map((index) => (
                <text key={index} x={xAt(index)} y={height - 8} textAnchor="middle" fontSize="8" fill="#8a8175">
                  {labelAt(index)}
                </text>
              ))}
          </svg>
          <div className="mt-1 flex items-center justify-center gap-4 text-xs text-gray2">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f0a202]" /> Down (MBit/s)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#6b2d91]" /> Up (MBit/s)
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-gray2">No bandwidth in this period.</p>
      )}
    </div>
  );
}

function niceMax(peak: number) {
  const padded = peak * 1.15;
  const power = Math.pow(10, Math.floor(Math.log10(padded)));
  const step = padded / power;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * power;
}

function NumberTable({
  title,
  empty,
  columns,
  rows,
}: {
  title: string;
  empty: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      {rows.length ? (
        <div className="max-h-72 overflow-auto rounded-md border border-borderlight">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface text-gray2">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-2 py-2 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.join("-")}-${index}`} className="border-t border-borderlight">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2 py-2 font-medium tabular-nums text-ink">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray2">{empty}</p>
      )}
    </div>
  );
}

export default function SignalCheckPage() {
  const { token } = useSession();
  const [serial, setSerial] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState<SignalStatus | null>(null);

  const check = async (value: string) => {
    const next = normalizeSerial(value);
    if (!isValidSerial(next)) {
      setError("Enter a valid ONT serial number.");
      return;
    }
    setSerial(next);
    setLoading(true);
    setError("");
    try {
      const result: SignalStatus = await apiGet(`/provisioning/signal?serial=${encodeURIComponent(next)}`, token, {
        timeoutMs: 45_000,
      });
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the signal from INCA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Signal check" subtitle="Live ONT signal from INCA" />
      <main className={cn(fieldContainer.narrow, "flex flex-col gap-4 p-4 pb-16")}>
        <form
          className="flex flex-col gap-3 rounded-lg border border-borderlight bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void check(serial);
          }}
        >
          <label htmlFor="signal-serial" className="text-sm font-semibold text-ink">
            ONT serial number
          </label>
          <div className="flex gap-2">
            <input
              id="signal-serial"
              className={cn("input flex-1 font-mono uppercase", error && "border-error")}
              value={serial}
              onChange={(event) => {
                setSerial(event.target.value);
                setError("");
              }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Scan or type serial"
            />
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label="Scan serial"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary"
            >
              <ScanLine className="h-[22px] w-[22px] text-white" />
            </button>
          </div>
          {error ? <InlineBanner tone="error" message={error} /> : null}
          <button
            type="submit"
            disabled={loading || !serial.trim()}
            className="flex h-[52px] items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            {loading ? "Reading from INCA…" : "Check signal"}
          </button>
        </form>

        {status ? (
          <>
            <ResultCard status={status} refreshing={loading} onRefresh={() => void check(status.serial)} />
            <ServicePanel key={status.serial} serial={status.serial} token={token} />
          </>
        ) : !loading ? (
          <EmptyState
            icon={SignalHigh}
            title="Check an ONT's signal"
            message="Scan or type the serial on the ONT label to see its live Rx level from INCA."
          />
        ) : null}
      </main>

      <SerialScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        onScanned={(value) => {
          setScanning(false);
          void check(value);
        }}
      />
    </>
  );
}
