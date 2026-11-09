"use client";

import { extractSerial, ponSerialsIn } from "@/lib/field/serial";

/** Part of the frame that is decoded, as a fraction of width / height; the on-screen guide box matches it. */
export const SCAN_REGION = { width: 0.86, height: 0.42 };

type Detector = { detect: (source: HTMLCanvasElement) => Promise<string[]> };

export type ScannerHandle = {
  stop: () => void;
  /** Reads a full-resolution still from the camera: every code found in it. */
  capture: () => Promise<string[]>;
  /** Present when the camera has a controllable flash. */
  torch?: (on: boolean) => Promise<void>;
  engine: "native" | "zxing";
};

const NATIVE_FORMATS = ["code_128", "code_39", "code_93", "qr_code", "data_matrix", "ean_13", "itf", "codabar"];

/** The browser's own barcode reader (Chrome on Android / macOS, Edge): far faster and sharper than JS decoding. */
async function nativeDetector(): Promise<Detector | null> {
  const Native = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported: string[] = (await Native.getSupportedFormats?.()) ?? [];
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    if (!formats.length) return null;
    const detector = new Native({ formats });
    return {
      detect: async (canvas) => ((await detector.detect(canvas)) as { rawValue: string }[]).map((code) => code.rawValue),
    };
  } catch {
    return null;
  }
}

async function zxingDetector(): Promise<Detector> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.EAN_13,
    BarcodeFormat.ITF,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);
  return {
    detect: async (canvas) => {
      try {
        return [reader.decodeFromCanvas(canvas).getText()];
      } catch {
        return [];
      }
    },
  };
}

/**
 * Opens the camera in HD with continuous focus and decodes the guide-box region
 * several times a second. `onCodes` gets every code found in one frame.
 */
export async function startBarcodeScanner(
  video: HTMLVideoElement,
  onCodes: (texts: string[]) => void,
): Promise<ScannerHandle> {
  const [native, stream] = await Promise.all([
    nativeDetector(),
    navigator.mediaDevices.getUserMedia({
      audio: false,
      // Ask for 4K; the camera gives its best resolution. Small ONT labels need every pixel.
      video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    }),
  ]);
  const detector = native ?? (await zxingDetector());
  const track = stream.getVideoTracks()[0];
  const capabilities = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
  }

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play().catch(() => undefined);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let stopped = false;
  let timer: number | undefined;

  const tick = async () => {
    if (stopped) return;
    if (context && video.readyState >= 2 && video.videoWidth) {
      const width = Math.round(video.videoWidth * SCAN_REGION.width);
      const height = Math.round(video.videoHeight * SCAN_REGION.height);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(
        video,
        (video.videoWidth - width) / 2,
        (video.videoHeight - height) / 2,
        width,
        height,
        0,
        0,
        width,
        height,
      );
      try {
        const texts = (await detector.detect(canvas)).filter(Boolean);
        if (texts.length && !stopped) onCodes(texts);
      } catch {
        // A bad frame; keep going.
      }
    }
    if (!stopped) timer = window.setTimeout(tick, native ? 40 : 90);
  };
  void tick();

  const capture = async () => {
    const Capture = (window as unknown as { ImageCapture?: any }).ImageCapture;
    if (Capture) {
      try {
        // Phones return the full sensor photo here, far sharper than a video frame.
        const photo: Blob = await new Capture(track).takePhoto();
        const texts = await scanImageFile(photo);
        if (texts.length) return texts;
      } catch {
        // Fall back to the video frame.
      }
    }
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const frame = document.createElement("canvas");
    frame.width = Math.round(video.videoWidth * scale);
    frame.height = Math.round(video.videoHeight * scale);
    frame.getContext("2d")?.drawImage(video, 0, 0, frame.width, frame.height);
    return scanCanvas(frame);
  };

  return {
    engine: native ? "native" : "zxing",
    capture,
    torch: capabilities.torch
      ? (on) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      : undefined,
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
      stream.getTracks().forEach((each) => each.stop());
      video.srcObject = null;
    },
  };
}

/** Longest side a photo is decoded at; phone photos are larger and slow to decode in full. */
const PHOTO_MAX_SIDE = 3000;

/**
 * All barcodes in a still photo (phone camera or file). Works without https and
 * reads labels a webcam can't, because a phone photo has several pixels per bar.
 */
export async function scanImageFile(file: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return scanCanvas(canvas);
}

/** Live camera needs https (or localhost); otherwise the phone's camera app is used for a photo. */
export function liveCameraAvailable() {
  return typeof window !== "undefined" && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
}

async function scanCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const native = await nativeDetector();
  if (native) {
    const texts = (await native.detect(canvas).catch(() => [])).filter(Boolean);
    if (texts.length) return [...new Set(texts)];
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = (data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000;
  }
  const { decodeAllBarcodes } = await import("./barcode-bands");
  return decodeAllBarcodes({ data: gray, width: canvas.width, height: canvas.height });
}

const MAC = /^([0-9A-F]{2}[:-]?){5}[0-9A-F]{2}$/i;

export type SerialPick = { serial: string } | { problem: string } | null;

/**
 * Chooses the serial among the codes read in one frame. A PON SN always wins; with
 * `ponOnly` (ONTs) nothing else is accepted, so the MAC, device SN and product
 * barcodes on the label are ignored. Two different serials at once are refused
 * rather than guessed.
 */
export function pickSerial(texts: string[], ponOnly = false): SerialPick {
  texts = texts.filter((text) => text.trim());
  if (!texts.length) return null;
  const pons = [...new Set(texts.flatMap(ponSerialsIn))];
  if (pons.length === 1) return { serial: pons[0] };
  if (pons.length > 1) return { problem: "Two PON SN barcodes are in the box. Move closer to one ONT label." };
  if (ponOnly) {
    return {
      problem: texts.some((text) => MAC.test(text.trim()))
        ? "That is the MAC barcode. Scan the PON SN / SN barcode."
        : `That is not the PON SN ("${texts[0].slice(0, 32)}"). Scan the barcode marked PON SN or SN.`,
    };
  }
  const labelled = texts.find((text) => /(?:^|[\s;,|])(?:S\/?N|SERIAL|G?PON\s*SN)\b/i.test(text));
  if (labelled) {
    const serial = extractSerial(labelled);
    if (serial) return { serial };
  }
  let candidates = [
    ...new Set(
      texts
        .filter((text) => !MAC.test(text.trim()))
        .map((text) => extractSerial(text))
        .filter((serial): serial is string => Boolean(serial)),
    ),
  ];
  // Next to a real serial, an all-digit code is the product (EAN) barcode.
  if (candidates.length > 1 && candidates.some((serial) => !/^\d+$/.test(serial))) {
    candidates = candidates.filter((serial) => !/^\d+$/.test(serial));
  }
  if (candidates.length === 1) return { serial: candidates[0] };
  if (candidates.length > 1) return { problem: "Two barcodes are in the box. Cover the others or move closer to the SN barcode." };
  if (texts.some((text) => MAC.test(text.trim()))) return { problem: "That is the MAC barcode. Scan the SN barcode." };
  return { problem: `Code read but no serial in it ("${texts[0].slice(0, 40)}").` };
}

let audio: AudioContext | null = null;

/** Short checkout-style beep; silently does nothing if audio is blocked. */
export function beep(ok = true) {
  try {
    audio ??= new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = ok ? 1650 : 320;
    gain.gain.setValueAtTime(0.12, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (ok ? 0.12 : 0.25));
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + (ok ? 0.12 : 0.25));
  } catch {
    // No audio available.
  }
}
