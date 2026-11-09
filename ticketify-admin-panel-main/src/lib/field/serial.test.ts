import { describe, expect, it } from "vitest";
import { canonicalSerial, extractSerial, isOntItem, isValidSerial, ponSerialsIn, toPonSerial } from "./serial";

describe("toPonSerial", () => {
  it("keeps the SN as printed on the label (16 hex)", () => {
    expect(toPonSerial("48575443686AEC86")).toBe("48575443686AEC86");
    expect(toPonSerial(" 48575443 686aec86 ")).toBe("48575443686AEC86");
    expect(toPonSerial("5A544547C1234567")).toBe("5A544547C1234567");
  });

  it("converts the short vendor form to the printed form", () => {
    expect(toPonSerial("HWTC686AEC86")).toBe("48575443686AEC86");
    expect(toPonSerial("HWTC-686AEC86")).toBe("48575443686AEC86");
    expect(toPonSerial("hwtc686aec86")).toBe("48575443686AEC86");
    expect(toPonSerial("ZTEGC1234567")).toBe("5A544547C1234567");
  });

  it("rejects MACs, device SNs, product codes and partial serials", () => {
    expect(toPonSerial("E0:37:68:12:AB:34")).toBeNull();
    expect(toPonSerial("E0376812AB34")).toBeNull();
    expect(toPonSerial("21530369847NG3000123")).toBeNull();
    expect(toPonSerial("6941487233816")).toBeNull();
    expect(toPonSerial("50083SLD")).toBeNull();
    expect(toPonSerial("48575443686AEC8")).toBeNull();
    expect(toPonSerial("HWTC686AEC8")).toBeNull();
    expect(toPonSerial("0000000000000000")).toBeNull();
    expect(toPonSerial("")).toBeNull();
  });
});

describe("canonicalSerial", () => {
  it("stores PON SNs as printed and other serials as typed", () => {
    expect(canonicalSerial("hwtc686aec86")).toBe("48575443686AEC86");
    expect(canonicalSerial(" sn 12 ab ")).toBe("SN12AB");
    expect(canonicalSerial("21530369847NG3000123")).toBe("21530369847NG3000123");
  });
});

describe("isValidSerial", () => {
  it("follows the API rule", () => {
    expect(isValidSerial("48575443686AEC86")).toBe(true);
    expect(isValidSerial("ab")).toBe(false);
    expect(isValidSerial("-ABC1")).toBe(false);
  });
});

describe("isOntItem", () => {
  it("detects ONTs by name or category", () => {
    expect(isOntItem({ name: "ONT Huawei HG8145X6" })).toBe(true);
    expect(isOntItem({ name: "HG8145X6", category: "ONT" })).toBe(true);
    expect(isOntItem({ name: "Fiber patch cord" })).toBe(false);
    expect(isOntItem({ name: "Frontier cable" })).toBe(false);
  });
});

describe("extractSerial", () => {
  it("prefers the labelled SN field", () => {
    expect(extractSerial("SN:48575443686AEC86;MAC:E0:37:68:12:AB:34")).toBe("48575443686AEC86");
    expect(extractSerial("PON SN: HWTC686AEC86")).toBe("48575443686AEC86");
    expect(extractSerial("S/N 21530369847NG3000123")).toBe("21530369847NG3000123");
  });

  it("falls back to the whole code or the first serial-like token", () => {
    expect(extractSerial("48575443686AEC86")).toBe("48575443686AEC86");
    expect(extractSerial("Model HG8145X6 2153036984")).toBe("HG8145X6");
    expect(extractSerial("21530369847NG3000123")).toBe("21530369847NG3000123");
    expect(extractSerial("??")).toBeNull();
  });
});

describe("ponSerialsIn", () => {
  it("finds every PON SN in a code, in the printed form", () => {
    expect(ponSerialsIn("48575443686AEC86")).toEqual(["48575443686AEC86"]);
    expect(ponSerialsIn("SN:HWTC686AEC86;MAC:E0:37:68:12:AB:34")).toEqual(["48575443686AEC86"]);
    expect(ponSerialsIn("48575443686AEC86 48575443A43AD89E")).toEqual(["48575443686AEC86", "48575443A43AD89E"]);
    expect(ponSerialsIn("E0376812AB34")).toEqual([]);
    expect(ponSerialsIn("21530369847NG3000123")).toEqual([]);
  });
});
