import bwipjs from "bwip-js/node";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { decodeAllBarcodes, type GrayImage } from "./barcode-bands";
import { pickSerial } from "./barcode-engine";

const SN = "48575443686AEC86";

type Code = { bcid: string; text: string };

/** The barcodes on a Huawei HG8145X6 box label, top to bottom. */
const HUAWEI_LABEL: Code[] = [
  { bcid: "code128", text: "50083SLD" },
  { bcid: "code128", text: SN },
  { bcid: "code128", text: "E0376812AB34" },
  { bcid: "code128", text: "21530369847NG3000123" },
  { bcid: "ean13", text: "6941487233816" },
];

async function label(codes: Code[], moduleWidth: number): Promise<Sharp> {
  const bars = await Promise.all(
    codes.map((code) =>
      bwipjs.toBuffer({
        bcid: code.bcid,
        text: code.text,
        scale: moduleWidth,
        ...(code.bcid === "qrcode" ? {} : { height: 8 }),
        paddingwidth: 10,
        paddingheight: 6,
      }),
    ),
  );
  const sizes = await Promise.all(bars.map((bar) => sharp(bar).metadata()));
  const width = Math.max(...sizes.map((size) => size.width ?? 0)) + 80;
  const gap = 12 * moduleWidth;
  let top = 40;
  const layers = bars.map((bar, index) => {
    const layer = { input: bar, left: 40, top };
    top += (sizes[index].height ?? 0) + gap;
    return layer;
  });
  return sharp({ create: { width, height: top + 40, channels: 3, background: "#fff" } }).composite(layers);
}

async function gray(image: Sharp): Promise<GrayImage> {
  const { data, info } = await sharp(await image.png().toBuffer())
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

async function scan(image: Sharp) {
  const texts = decodeAllBarcodes(await gray(image));
  return { texts, pick: pickSerial(texts, true) };
}

describe("photo decoding of an ONT box label", () => {
  it("reads every barcode on the label and picks the PON SN", async () => {
    const { texts, pick } = await scan(await label(HUAWEI_LABEL, 3));
    expect(texts).toEqual(expect.arrayContaining(HUAWEI_LABEL.map((code) => code.text)));
    expect(pick).toEqual({ serial: SN });
  });

  it("reads small labels (about one pixel per bar)", async () => {
    expect((await scan(await label(HUAWEI_LABEL, 1))).pick).toEqual({ serial: SN });
  });

  it("reads a label photographed sideways", async () => {
    const image = sharp(await (await label(HUAWEI_LABEL, 2)).png().toBuffer()).rotate(90);
    expect((await scan(image)).pick).toEqual({ serial: SN });
  });

  it("reads a slightly tilted label", async () => {
    const image = sharp(await (await label(HUAWEI_LABEL, 3)).png().toBuffer()).rotate(4, { background: "#fff" });
    expect((await scan(image)).pick).toEqual({ serial: SN });
  });

  it("reads a soft, JPEG-compressed photo", async () => {
    const jpeg = await (await label(HUAWEI_LABEL, 3)).blur(1).jpeg({ quality: 55 }).toBuffer();
    expect((await scan(sharp(jpeg))).pick).toEqual({ serial: SN });
  });

  it("reads a dim, low-contrast photo", async () => {
    const image = sharp(await (await label(HUAWEI_LABEL, 3)).png().toBuffer()).linear(0.45, 90);
    expect((await scan(image)).pick).toEqual({ serial: SN });
  });

  it("returns the printed form when the SN barcode holds the vendor form", async () => {
    const codes = HUAWEI_LABEL.map((code) => (code.text === SN ? { ...code, text: "HWTC686AEC86" } : code));
    expect((await scan(await label(codes, 2))).pick).toEqual({ serial: SN });
  });

  it("reads the SN from a QR code", async () => {
    const codes = [{ bcid: "qrcode", text: `SN:${SN};MAC:E0:37:68:12:AB:34` }];
    expect((await scan(await label(codes, 4))).pick).toEqual({ serial: SN });
  });

  it("explains a photo that shows only the MAC barcode", async () => {
    const { pick } = await scan(await label([HUAWEI_LABEL[2]], 3));
    expect(pick).toHaveProperty("problem", expect.stringContaining("MAC"));
  });

  it("finds nothing on a blank photo", async () => {
    const blank = sharp({ create: { width: 800, height: 500, channels: 3, background: "#fff" } });
    expect((await scan(blank)).texts).toEqual([]);
  });
});
