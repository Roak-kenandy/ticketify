"use client";

import { Aperture, Camera, Flashlight, FlashlightOff, Keyboard, Loader2, ScanLine, X } from "lucide-react";
import { ScanButton, serialsFromCodes } from "@/components/app/scan-button";
import React from "react";
import { cn } from "@/lib/field/cn";
import { beep, pickSerial, startBarcodeScanner, type ScannerHandle } from "@/lib/barcode-engine";
import { isValidSerial, normalizeSerial } from "@/lib/field/serial";
import { PrimaryButton } from "./button";
import { Overlay } from "./overlay";

type Controls = ScannerHandle;

/** Full-screen barcode/QR scanner for device serials, with manual entry fallback. */
export default function SerialScanner({
  visible,
  title = "Scan ONT serial",
  ponOnly = true,
  onClose,
  onScanned,
}: {
  visible: boolean;
  title?: string;
  /** ONTs: accept only the PON SN barcode and ignore the rest of the label. */
  ponOnly?: boolean;
  onClose: () => void;
  onScanned: (serial: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<Controls | null>(null);
  const handled = React.useRef(false);
  const onScannedRef = React.useRef(onScanned);
  onScannedRef.current = onScanned;
  const ponOnlyRef = React.useRef(ponOnly);
  ponOnlyRef.current = ponOnly;

  const [manual, setManual] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [unreadable, setUnreadable] = React.useState("");
  const [cameraError, setCameraError] = React.useState("");
  const [torch, setTorch] = React.useState(false);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [capturing, setCapturing] = React.useState(false);

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
      setCameraError("Live scanning needs a secure (https) connection. Take a photo of the label instead.");
      return;
    }
    let cancelled = false;
    setCameraError("");
    setTorchSupported(false);

    (async () => {
      try {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (cancelled || !videoRef.current) {
          return;
        }
        const handle = await startBarcodeScanner(videoRef.current, (texts) => {
          if (handled.current) {
            return;
          }
          const pick = pickSerial(texts, ponOnlyRef.current);
          if (!pick) {
            return;
          }
          if ("problem" in pick) {
            setUnreadable(pick.problem);
            return;
          }
          handled.current = true;
          beep();
          navigator.vibrate?.(40);
          controlsRef.current?.stop();
          onScannedRef.current(pick.serial);
        });
        if (cancelled) {
          handle.stop();
          return;
        }
        controlsRef.current = handle;
        setTorchSupported(Boolean(handle.torch));
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

  const finish = (serial: string) => {
    if (handled.current) {
      return;
    }
    handled.current = true;
    beep();
    navigator.vibrate?.(40);
    controlsRef.current?.stop();
    onScannedRef.current(serial);
  };

  /** Full-resolution still for labels too small for the live preview. */
  const capture = async () => {
    if (!controlsRef.current || capturing) {
      return;
    }
    setCapturing(true);
    setUnreadable("Reading the picture…");
    try {
      const result = serialsFromCodes(await controlsRef.current.capture(), { ponOnly });
      if ("serials" in result) {
        finish(result.serials[0]);
      } else {
        beep(false);
        setUnreadable(result.problem);
      }
    } catch {
      setUnreadable("Couldn't read the picture. Try again.");
    } finally {
      setCapturing(false);
    }
  };

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await controlsRef.current?.torch?.(next);
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
              placeholder="e.g. 48575443686AEC86"
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
            <ScanButton
              ponOnly={ponOnly}
              onLiveCamera={() => setAttempt((value) => value + 1)}
              onSerials={(serials) => serials[0] && finish(serials[0])}
              className="flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
            >
              {(reading) => (
                <>
                  {reading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Camera className="h-[18px] w-[18px]" />}
                  Take a photo of the label
                </>
              )}
            </ScanButton>
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
              {unreadable || "Hold the PON SN / SN barcode on the ONT label inside the box"}
            </p>
          </div>
        )}

        <div className="flex justify-center gap-3 p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {!manual && !cameraError && (
            <button
              type="button"
              onClick={capture}
              disabled={capturing}
              className="flex items-center gap-2 rounded-full bg-secondary px-6 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
            >
              {capturing ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Aperture className="h-[18px] w-[18px]" />}
              Capture
            </button>
          )}
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
