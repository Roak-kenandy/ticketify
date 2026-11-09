"use client";

import * as React from "react";
import { Aperture, Camera, Flashlight, FlashlightOff, Loader2 } from "lucide-react";
import { serialsFromCodes } from "@/components/app/scan-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { beep, pickSerial, SCAN_REGION, startBarcodeScanner, type ScannerHandle } from "@/lib/barcode-engine";
import { cn } from "@/lib/utils";

/** Camera barcode/QR scanner that keeps scanning until closed, one callback per new serial. */
export function BarcodeScanDialog({
  open,
  title,
  status,
  ponOnly = true,
  onClose,
  onScanned,
}: {
  open: boolean;
  title: string;
  /** ONTs: accept only the PON SN barcode and ignore the rest of the label. */
  ponOnly?: boolean;
  /** Feedback for the last scan, shown under the video. */
  status?: React.ReactNode;
  onClose: () => void;
  onScanned: (serial: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const handleRef = React.useRef<ScannerHandle | null>(null);
  const onScannedRef = React.useRef(onScanned);
  onScannedRef.current = onScanned;
  const ponOnlyRef = React.useRef(ponOnly);
  ponOnlyRef.current = ponOnly;
  const [error, setError] = React.useState("");
  const [hint, setHint] = React.useState("");
  const [flash, setFlash] = React.useState(false);
  const [aspect, setAspect] = React.useState(16 / 9);
  const [torch, setTorch] = React.useState<boolean | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [capturing, setCapturing] = React.useState(false);
  const [resolution, setResolution] = React.useState("");
  /** Beep, flash and report a serial; set by the camera effect. */
  const announceRef = React.useRef<(serial: string) => void>(() => undefined);

  React.useEffect(() => {
    if (!open) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Live scanning needs a secure (https) connection. Close this and use Scan to take a photo, or use a handheld scanner.");
      return;
    }
    let cancelled = false;
    /** Boxes already reported while this camera is open; a box held in view is read many times. */
    const reported = new Set<string>();
    let flashTimer: number | undefined;
    setError("");
    setHint("");
    setTorch(null);

    announceRef.current = (serial) => {
      if (reported.has(serial)) {
        setHint(`${serial} is already added. Show the next box.`);
        return;
      }
      reported.add(serial);
      setHint("");
      beep();
      navigator.vibrate?.(40);
      setFlash(true);
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => setFlash(false), 250);
      onScannedRef.current(serial);
    };

    (async () => {
      // The <video> mounts with the dialog, one frame after `open` flips.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const video = videoRef.current;
      if (cancelled || !video) return;
      try {
        const handle = await startBarcodeScanner(video, (texts) => {
          const pick = pickSerial(texts, ponOnlyRef.current);
          if (!pick) return;
          if ("problem" in pick) {
            setHint(pick.problem);
            return;
          }
          announceRef.current(pick.serial);
        });
        if (cancelled) {
          handle.stop();
          return;
        }
        handleRef.current = handle;
        const measure = () => {
          if (!video.videoWidth) return;
          setAspect(video.videoWidth / video.videoHeight);
          setResolution(`${video.videoWidth}×${video.videoHeight}`);
        };
        if (video.videoWidth) measure();
        else video.onloadedmetadata = measure;
        if (handle.torch) setTorch(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.name === "NotAllowedError"
            ? "Allow camera access in the browser to scan barcodes."
            : err?.name === "NotFoundError"
              ? "No camera found. Use a handheld scanner or type the serial."
              : "Could not start the camera. Use a handheld scanner or type the serial.",
        );
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(flashTimer);
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [open, attempt]);

  /** Full-resolution still: reads labels too small for the live preview. */
  const capture = async () => {
    const handle = handleRef.current;
    if (!handle || capturing) return;
    setCapturing(true);
    setHint("Reading the picture…");
    try {
      const result = serialsFromCodes(await handle.capture(), { ponOnly, multiple: true });
      if ("serials" in result) result.serials.forEach((serial) => announceRef.current(serial));
      else {
        beep(false);
        setHint(result.problem);
      }
    } catch {
      setHint("Couldn't read the picture. Try again.");
    } finally {
      setCapturing(false);
    }
  };

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await handleRef.current?.torch?.(next);
      setTorch(next);
    } catch {
      setTorch(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-1rem)] max-w-xl flex-col gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Hold the label so the PON SN / SN barcode fills the box. It beeps as soon as it reads; if it doesn&apos;t,
            hold still and press Capture.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Camera className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </div>
        ) : (
          <div
            className="relative mx-auto shrink-0 overflow-hidden rounded-md bg-black"
            // Fit the screen height as well as the width, keeping the camera's shape so the guide box matches.
            style={{ aspectRatio: aspect, width: `min(100%, calc(55dvh * ${aspect}))` }}
          >
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
            <div
              className={cn(
                "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 transition-colors",
                flash ? "border-success bg-success/25" : "border-white/85",
              )}
              style={{ width: `${SCAN_REGION.width * 100}%`, height: `${SCAN_REGION.height * 100}%` }}
            >
              <div className="absolute inset-x-3 top-1/2 h-px bg-red-500/80" />
            </div>
            {torch !== null && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torch ? "Turn light off" : "Turn light on"}
                className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white"
              >
                {torch ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
              </button>
            )}
            {hint && (
              <p className="absolute inset-x-3 bottom-3 rounded bg-black/60 px-2 py-1 text-center text-xs text-white">
                {hint}
              </p>
            )}
          </div>
        )}
        {status ? <div className="min-h-[20px] text-sm">{status}</div> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{resolution && `Camera ${resolution}`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
            {!error && (
              <Button onClick={capture} disabled={capturing || !resolution}>
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Aperture className="h-4 w-4" />}
                Capture
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
