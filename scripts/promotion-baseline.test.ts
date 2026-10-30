import { describe, it, expect } from "vitest";
import { promotionBaseline } from "./promotion-baseline";
describe("explicit read-only promotion baseline", () => {
  it("retains Phase 2 as the default and requires an explicit Phase 3 selection", () => {
    expect(promotionBaseline("")).toEqual({ baseline: "phase2", migrationCount: 2 });
    expect(promotionBaseline("phase3")).toEqual({ baseline: "phase3", migrationCount: 4 });
  });
  it.each(["production", "phase35", "auto", "latest", "4", "hostinger"])(
    "rejects unknown or inferred baseline %s",
    (value) => {
      expect(() => promotionBaseline(value)).toThrow("Unknown promotion baseline");
    },
  );
});
