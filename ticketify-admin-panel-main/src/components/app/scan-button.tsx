"use client";

import * as React from "react";
import { toast } from "sonner";
import { liveCameraAvailable, pickSerial, scanImageFile } from "@/lib/barcode-engine";
import { ponSerialsIn } from "@/lib/field/serial";

/** Turns the codes read from one picture into serials, or explains what's wrong. */
export function serialsFromCodes(
  texts: string[],
  { ponOnly = true, multiple = false }: { ponOnly?: boolean; multiple?: boolean } = {},
): { serials: string[] } | { problem: string } {
  if (!texts.length) {
    return {
      problem:
        "No barcode found. Bring the label closer so the SN barcode fills most of the box, hold still, and try again.",
    };
  }
  const pons = [...new Set(texts.flatMap(ponSerialsIn))];
  if (multiple && pons.length > 1) return { serials: pons };
  const pick = pickSerial(texts, ponOnly);
  return pick && "serial" in pick ? { serials: [pick.serial] } : { problem: pick?.problem ?? "No serial found." };
}

/**
 * The one "Scan" button: opens the in-app camera (`onLiveCamera`) where the browser
 * allows it (https / localhost), otherwise the phone's camera app, and reads the photo.
 */
export function ScanButton({
  onLiveCamera,
  onSerials,
  ponOnly = true,
  multiple = false,
  disabled,
  className,
  children,
}: {
  onLiveCamera: () => void;
  onSerials: (serials: string[]) => void;
  ponOnly?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  /** Button content; receives whether a photo is being read. */
  children: (busy: boolean) => React.ReactNode;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function read(file: File) {
    setBusy(true);
    try {
      const result = serialsFromCodes(await scanImageFile(file), { ponOnly, multiple });
      if ("serials" in result) onSerials(result.serials);
      else toast.error(result.problem);
    } catch {
      toast.error("Couldn't read that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={() => (liveCameraAvailable() ? onLiveCamera() : inputRef.current?.click())}
      >
        {children(busy)}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file);
        }}
      />
    </>
  );
}
