import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";

/** Grayscale image, one byte per pixel, row by row. */
export type GrayImage = { data: Uint8ClampedArray; width: number; height: number };

const HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.EAN_13,
      BarcodeFormat.ITF,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

function rotate90(image: GrayImage): GrayImage {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[x * height + (height - 1 - y)] = data[y * width + x];
    }
  }
  return { data: out, width: height, height: width };
}

function decodeRegion(reader: MultiFormatReader, image: GrayImage, top: number, rows: number): string | null {
  const slice = image.data.subarray(top * image.width, (top + rows) * image.width);
  try {
    const source = new RGBLuminanceSource(slice, image.width, rows);
    return reader.decode(new BinaryBitmap(new HybridBinarizer(source)), HINTS).getText();
  } catch {
    return null;
  } finally {
    reader.reset();
  }
}

/**
 * Every barcode in a still photo. zxing returns one code per decode, and an ONT label
 * has several stacked barcodes, so the photo is decoded in overlapping horizontal
 * strips (and again turned 90° for labels photographed sideways).
 */
export function decodeAllBarcodes(image: GrayImage): string[] {
  const reader = new MultiFormatReader();
  reader.setHints(HINTS);
  const found = new Set<string>();
  for (const view of [image, rotate90(image)]) {
    const whole = decodeRegion(reader, view, 0, view.height);
    if (whole) found.add(whole);
    for (const fraction of [0.06, 0.12]) {
      const rows = Math.max(48, Math.round(view.height * fraction));
      const step = Math.max(16, Math.round(rows / 2));
      for (let top = 0; top + rows <= view.height; top += step) {
        const text = decodeRegion(reader, view, top, rows);
        if (text) found.add(text);
      }
    }
    if (found.size) break;
  }
  return [...found];
}
