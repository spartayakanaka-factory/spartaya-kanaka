import { describe, expect, it } from "vitest";
import { getProductImageUrl } from "./asset-url";

describe("catalog image URLs", () => {
  it("serves configured HTTPS displays and loopback-only development storage", () => {
    expect(getProductImageUrl({ localPath: "", publicUrl: "https://images.example/display.webp" })).toBe("https://images.example/display.webp");
    expect(getProductImageUrl({ localPath: "", publicUrl: "http://127.0.0.1:39000/display.webp" })).toBe("http://127.0.0.1:39000/display.webp");
  });
  it("rejects insecure remote and executable URLs, preserving encoded archive paths", () => {
    for (const publicUrl of ["http://untrusted.invalid/image.jpg", "javascript:alert(1)", "broken-url"]) {
      expect(getProductImageUrl({ localPath: "صور/1.jpg", publicUrl })).toBe("/assets/%D8%B5%D9%88%D8%B1/1.jpg");
    }
  });
});
