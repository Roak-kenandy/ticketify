import { describe, expect, it } from "vitest";
import { pickSerial } from "./barcode-engine";

const SN = "48575443686AEC86";
const MAC = "E0376812AB34";
const DEVICE_SN = "21530369847NG3000123";
const EAN = "6941487233816";
const ITEM = "50083SLD";

describe("pickSerial for ONTs (PON SN only)", () => {
  it("picks the PON SN out of every barcode on the label", () => {
    expect(pickSerial([ITEM, SN, MAC, DEVICE_SN, EAN], true)).toEqual({ serial: SN });
    expect(pickSerial([MAC, SN], true)).toEqual({ serial: SN });
  });

  it("returns the printed form when the barcode holds the vendor form", () => {
    expect(pickSerial(["HWTC686AEC86", MAC], true)).toEqual({ serial: SN });
  });

  it("treats both forms of one ONT as the same serial", () => {
    expect(pickSerial([SN, "HWTC686AEC86"], true)).toEqual({ serial: SN });
  });

  it("reads the SN out of a QR code with several fields", () => {
    expect(pickSerial([`SN:${SN};MAC:E0:37:68:12:AB:34`], true)).toEqual({ serial: SN });
  });

  it("refuses two different ONTs in one frame", () => {
    expect(pickSerial([SN, "48575443A43AD89E"], true)).toHaveProperty("problem");
  });

  it("explains when only the MAC or another barcode was read", () => {
    expect(pickSerial([MAC], true)).toEqual({ problem: "That is the MAC barcode. Scan the PON SN / SN barcode." });
    expect(pickSerial(["E0:37:68:12:AB:34"], true)).toHaveProperty("problem", expect.stringContaining("MAC"));
    expect(pickSerial([DEVICE_SN], true)).toHaveProperty("problem", expect.stringContaining("not the PON SN"));
    expect(pickSerial([EAN, ITEM], true)).toHaveProperty("problem", expect.stringContaining("not the PON SN"));
  });
});

describe("pickSerial for other serial items", () => {
  it("still prefers a PON SN", () => {
    expect(pickSerial([DEVICE_SN, SN], false)).toEqual({ serial: SN });
  });

  it("uses a labelled SN field", () => {
    expect(pickSerial(["S/N:AB12CD34", "XYZ999"], false)).toEqual({ serial: "AB12CD34" });
  });

  it("ignores the product EAN next to a real serial", () => {
    expect(pickSerial([EAN, DEVICE_SN], false)).toEqual({ serial: DEVICE_SN });
  });

  it("ignores the MAC", () => {
    expect(pickSerial([MAC, DEVICE_SN], false)).toEqual({ serial: DEVICE_SN });
    expect(pickSerial([MAC], false)).toHaveProperty("problem", expect.stringContaining("MAC"));
  });

  it("refuses two different serials rather than guessing", () => {
    expect(pickSerial([DEVICE_SN, "AB12CD34"], false)).toHaveProperty("problem");
  });

  it("accepts a lone numeric serial", () => {
    expect(pickSerial(["2224123000123"], false)).toEqual({ serial: "2224123000123" });
  });
});
