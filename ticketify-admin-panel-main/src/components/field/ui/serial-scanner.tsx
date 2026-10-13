"use client";

import { Camera, Flashlight, FlashlightOff, Keyboard, ScanLine, X } from "lucide-react";
import React from "react";
import { cn } from "@/lib/field/cn";
import { extractSerial, isValidSerial, normalizeSerial } from "@/lib/field/serial";
import { PrimaryButton } from "./button";
import { Overlay } from "./overlay";

type Controls = { stop: () => void; switchTorch?: (on: boolean) => Promise<void> };

/** Full-screen barcode/QR scanner for device serials, with manual entry fallback. */
export default function SerialScanner({
  visible,
  title = "Scan ONT serial",
  onClose,
  onScanned,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onScanned: (serial: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<Controls | null>(null);
  const handled = React.useRef(false);
  const onScannedRef = React.useRef(onScanned);
  onScannedRef.current = onScanned;

  const [manual, setManual] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [unreadable, setUnreadable] = React.useState("");
  const [cameraError, setCameraError] = React.useState("");
  const [torch, setTorch] = React.useState(false);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    handled.current = false;
    setManual(false);
    setTyped("");
    setUnreadable("");
    setTorch(false);
  }, [visible]);

  React.useEffect(() => {
    if (!visible || manual) {
      return;
    }
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("The camera needs a secure (https) connection. Enter the serial manually.");
      return;
    }
    let cancelled = false;
    setCameraError("");
    setTorchSupported(false);

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled || !videoRef.current) {
          return;
        }
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.EAN_13,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current,
          (result) => {
            if (!result || handled.current) {
              return;
            }
            const raw = result.getText();
            const serial = raw ? extractSerial(raw) : null;
            if (serial) {
              handled.current = true;
              navigator.vibrate?.(40);
              controlsRef.current?.stop();
              onScannedRef.current(serial);
            } else if (raw) {
              setUnreadable(raw.slice(0, 40));
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls as Controls;
        setTorchSupported(typeof (controls as Controls).switchTorch === "function");
      } catch (error: any) {
        if (cancelled) {
          return;
        }
        setCameraError(
          error?.name === "NotAllowedError"
            ? "Allow camera access in your browser settings to scan the serial barcode."
            : error?.name === "NotFoundError"
              ? "No camera found on this device."
              : "Could not start the camera. Enter the serial manually.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [visible, manual, attempt]);

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorch(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const typedSerial = normalizeSerial(typed);
  const typedValid = isValidSerial(typedSerial);

  return (
    <Overlay open={visible} onEscape={onClose}>
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#05081F]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"
          >
            <X className="h-[22px] w-[22px] text-white" />
          </button>
          <h2 className="text-[17px] font-semibold text-white">{title}</h2>
          {!manual && torchSupported ? (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torch ? "Turn torch off" : "Turn torch on"}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                torch ? "bg-white" : "bg-white/15",
              )}
            >
              {torch ? (
                <Flashlight className="h-5 w-5 text-primary" />
              ) : (
                <FlashlightOff className="h-5 w-5 text-white" />
              )}
            </button>
          ) : (
            <span className="h-10 w-10" />
          )}
        </div>

        {manual ? (
          <form
            className="flex flex-1 flex-col gap-3 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (typedValid) {
                onScanned(typedSerial);
              }
            }}
          >
            <label className="text-sm font-semibold text-white" htmlFor="serial-manual">
              Serial number
            </label>
            <input
              id="serial-manual"
              className="input uppercase"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder="e.g. HWTC1A2B3C4D"
            />
            <p className="text-xs text-white/70">
              {typed && !typedValid
                ? "Use 4–64 letters or digits as printed on the label."
                : "Type the serial exactly as printed on the device label."}
            </p>
            <PrimaryButton type="submit" text="Use this serial" disabled={!typedValid} className="bg-secondary text-primary" />
          </form>
        ) : cameraError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <Camera className="h-10 w-10 text-white" />
            <p className="text-[15px] text-white">{cameraError}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-[78%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-secondary" />
            <p className="absolute inset-x-6 bottom-6 rounded-md bg-black/55 px-3 py-2 text-center text-[13px] text-white">
              {unreadable
                ? `Code read but no serial found ("${unreadable}"). Try the SN barcode.`
                : "Point at the SN barcode or QR code on the ONT label"}
            </p>
          </div>
        )}

        <div className="flex justify-center p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setManual((value) => !value)}
            className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {manual ? <ScanLine className="h-[18px] w-[18px]" /> : <Keyboard className="h-[18px] w-[18px]" />}
            {manual ? "Scan instead" : "Enter manually"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
