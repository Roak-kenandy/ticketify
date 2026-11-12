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
import type { OpticalReading } from "@/types/field-workflow";

type SignalStatus = {
  serial: string;
  range: { min_dbm: number; max_dbm: number };
  found: boolean;
  device: { registered: boolean; device_type: string | null; olt: string | null; pon: string | null } | null;
  reading: OpticalReading | null;
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
  const high = Math.max(range.min_dbm, range.max_dbm);
  const low = Math.min(range.min_dbm, range.max_dbm);
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
        Accepted range {high} to {low} dBm. Tickets can&apos;t be closed with a signal outside it.
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
        {reading?.details?.length ? (
          reading.details.map((line) => <Fact key={line.label} label={line.label} value={line.value} />)
        ) : reading ? (
          <>
            <Fact label="Tx" value={reading.tx_dbm !== null ? `${reading.tx_dbm} dBm` : null} />
            <Fact label="OLT Rx" value={reading.olt_rx_dbm !== null ? `${reading.olt_rx_dbm} dBm` : null} />
            <Fact label="Status" value={reading.online ? "Online" : "Offline"} />
            <Fact label="Alarms" value={reading.alarms.join(", ") || "None"} />
          </>
        ) : null}
        {reading ? <Fact label="Read at" value={moment(reading.read_at).format("HH:mm:ss")} /> : null}
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
          <ResultCard status={status} refreshing={loading} onRefresh={() => void check(status.serial)} />
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
