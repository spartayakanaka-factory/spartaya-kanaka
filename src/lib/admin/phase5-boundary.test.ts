import { describe, it, expect } from "vitest";
import { commerceEnabled } from "../commerce/runtime";
import { orderStateLabels } from "./order-presentation";
describe("Phase 5 disposable boundary", () => {
  const environment = {
    NODE_ENV: "test" as const,
    P5_WORKSTREAM: "1",
    P3_ENABLED: "1",
    P3_SIMULATION: "1",
    P3_DISPOSABLE: "1",
    PAYMENT_MODE: "MOCK",
    APP_ENV: "local",
    STAGING_SITE: "0",
    DATABASE_URL: "mysql://sprtaya_phase5:synthetic@127.0.0.1:33078/sprtaya_phase5_disposable_test",
  };
  it("requires the explicit workstream, exact account, loopback port and target", () => {
    expect(commerceEnabled(environment)).toBe(true);
    for (const patch of [
      { P5_WORKSTREAM: "0" },
      { PAYMENT_MODE: "LIVE" },
      { APP_ENV: "staging" },
      { DATABASE_URL: environment.DATABASE_URL.replace("33078", "3306") },
      { DATABASE_URL: environment.DATABASE_URL.replace("sprtaya_phase5:", "root:") },
      { DATABASE_URL: environment.DATABASE_URL.replace("_test", "_merchant") },
    ])
      expect(commerceEnabled({ ...environment, ...patch })).toBe(false);
  });
  it("uses the service's canonical production and dispatch states", () => {
    expect(orderStateLabels.IN_PRODUCTION).toBe("قيد التصنيع");
    expect(orderStateLabels.READY).toBe("جاهز للشحن");
    expect(orderStateLabels.CANCELLED).toBe("ملغي");
  });
});
