import { describe, it, expect, vi } from "vitest";
import { createReportAuthGuard } from "./report-auth-guard";
describe("report authentication deadline", () => {
  it("fails closed on timeout and bounds outstanding work until it settles", async () => {
    vi.useFakeTimers();
    try {
      const guard = createReportAuthGuard(1, 1000);
      let finish!: (s: string) => void;
      const first = guard(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(await first).toEqual({ ok: false });
      expect(await guard(async () => "owner")).toEqual({ ok: false });
      finish("owner");
      await vi.runAllTicks();
      await Promise.resolve();
      await Promise.resolve();
      expect(await guard(async () => "owner")).toEqual({ ok: true, value: "owner" });
    } finally {
      vi.useRealTimers();
    }
  });
});
