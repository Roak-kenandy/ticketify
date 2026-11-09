import { describe, expect, it } from "vitest";
import { serialsFromCodes } from "./scan-button";

const SN = "48575443686AEC86";

describe("serialsFromCodes", () => {
  it("returns the PON SN from a photo of the whole label", () => {
    expect(serialsFromCodes(["50083SLD", SN, "E0376812AB34", "21530369847NG3000123"])).toEqual({ serials: [SN] });
  });

  it("returns the printed form for a vendor-form barcode", () => {
    expect(serialsFromCodes(["HWTC686AEC86"])).toEqual({ serials: [SN] });
  });

  it("tells the user when nothing was read", () => {
    expect(serialsFromCodes([])).toHaveProperty("problem", expect.stringContaining("No barcode found"));
  });

  it("accepts several ONTs at once only where the form allows it", () => {
    const two = [SN, "48575443A43AD89E"];
    expect(serialsFromCodes(two, { multiple: true })).toEqual({ serials: two });
    expect(serialsFromCodes(two)).toHaveProperty("problem");
  });

  it("explains a MAC-only photo", () => {
    expect(serialsFromCodes(["E0376812AB34"])).toHaveProperty("problem", expect.stringContaining("MAC"));
  });
});
