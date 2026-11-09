"use client";

import * as React from "react";
import { Camera, CircleAlert, CircleCheck, Loader2, ScanLine, X } from "lucide-react";
import { ScanButton } from "@/components/app/scan-button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Notice = { ok: boolean; text: string };

/** Box labels are long; people match the last digits, so those are emphasised. */
export function SerialText({ serial }: { serial: string }) {
  const cut = Math.max(0, serial.length - 4);
  return (
    <span className="font-mono text-xs">
      <span className="opacity-60">{serial.slice(0, cut)}</span>
      <span className="font-bold">{serial.slice(cut)}</span>
    </span>
  );
}

export function NoticeLine({ notice }: { notice: Notice | null | undefined }) {
  if (!notice) return null;
  return (
    <p role="status" className={cn("flex items-start gap-1.5 text-sm", notice.ok ? "text-success" : "text-destructive")}>
      {notice.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
      {notice.text}
    </p>
  );
}

/**
 * Input for handheld barcode scanners (they type the code and press Enter) that also
 * accepts typing and pasting a list, plus one Scan button for the device camera.
 */
export function ScanField({
  id,
  onScan,
  onCamera,
  placeholder = "Handheld scanner, or type the SN and press Enter",
  disabled,
  autoFocus,
  captureKeys,
  ponOnly = true,
}: {
  id: string;
  onScan: (raw: string) => void;
  onCamera: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Also take scanner bursts typed while focus is elsewhere (not in another field). */
  captureKeys?: boolean;
  /** ONT lines: photos only yield the PON SN. */
  ponOnly?: boolean;
}) {
  const [value, setValue] = React.useState("");
  const onScanRef = React.useRef(onScan);
  onScanRef.current = onScan;

  React.useEffect(() => {
    if (!captureKeys || disabled) return;
    let buffer = "";
    let last = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const now = performance.now();
      // Scanners type a whole code in a few ms per key; people are far slower.
      if (now - last > 60) buffer = "";
      last = now;
      if (event.key === "Enter" || event.key === "Tab") {
        if (buffer.length >= 4) {
          event.preventDefault();
          onScanRef.current(buffer);
        }
        buffer = "";
      } else if (event.key.length === 1) {
        buffer += event.key;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [captureKeys, disabled]);

  const flush = (text: string) => {
    text
      .split(/[\r\n,;\t]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(onScan);
    setValue("");
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Scanners end each code with Enter (some with Tab); never submit the form from here.
            if (e.key === "Enter" || (e.key === "Tab" && value.trim())) {
              e.preventDefault();
              flush(value);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\r\n,;\t]/.test(text.trim())) {
              e.preventDefault();
              flush(text);
            }
          }}
          placeholder={placeholder}
          className="pl-9 font-mono uppercase placeholder:font-sans placeholder:normal-case"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="characters"
        />
      </div>
      <ScanButton
        ponOnly={ponOnly}
        multiple
        disabled={disabled}
        className={buttonVariants({ variant: "outline" })}
        onLiveCamera={onCamera}
        onSerials={(serials) => serials.forEach((serial) => onScanRef.current(serial))}
      >
        {(busy) => (
          <>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Scan
          </>
        )}
      </ScanButton>
    </div>
  );
}

/** Scanned serials as removable chips; flagged ones are red with the reason. */
export function SerialChips({
  serials,
  flags,
  onRemove,
}: {
  serials: string[];
  flags?: Record<string, string>;
  onRemove: (serial: string) => void;
}) {
  if (!serials.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {serials.map((serial) => {
        const problem = flags?.[serial];
        return (
          <span
            key={serial}
            title={problem}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border bg-card py-0.5 pl-2 pr-0.5",
              problem && "border-destructive bg-destructive/10 text-destructive",
            )}
          >
            <SerialText serial={serial} />
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${serial}`}
              onClick={() => onRemove(serial)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
