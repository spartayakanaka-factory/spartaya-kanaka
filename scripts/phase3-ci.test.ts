import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ciTargets } from "./ci-targets.mjs";
describe("validation-only CI isolation", () => {
  it.each([{ args: [] }, { args: ["--phase35"] }, { args: ["--phase4"] }])(
    "refuses ordinary execution before starting Docker or a database (%j)",
    ({ args }) => {
      const result = spawnSync(process.execPath, ["scripts/phase3-ci.mjs", ...args], {
        env: { ...process.env, CI: "false", GITHUB_ACTIONS: "false" },
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Only an ephemeral GitHub Linux/Node22 runner");
      expect(result.stdout).not.toContain("Starting newly named");
    },
  );
  it("has no push trigger, write permission, persisted Git credentials or deployment operation", () => {
    const workflow = readFileSync(".github/workflows/phase3-validation.yml", "utf8");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toMatch(
      /\bpush:|pull_request_target:|contents:\s*write|secrets\.|hosting_deploy|hostinger\s+(?:up|deploy)|migrate deploy/i,
    );
    expect(workflow).toContain("node scripts/phase3-ci.mjs");
  });
  it("supports only the three finite disposable namespaces and matching local ports", () => {
    const phase3 = ciTargets("phase3"),
      phase35 = ciTargets("phase35");
    expect(phase3.schemas).toEqual([
      "sprtaya_phase3_disposable_local",
      "sprtaya_phase3_disposable_test",
    ]);
    expect(phase35.schemas).toEqual([
      "sprtaya_phase35_disposable_local",
      "sprtaya_phase35_disposable_test",
    ]);
    expect(phase35).toMatchObject({
      user: "sprtaya_phase35",
      appPort: 3005,
      storagePort: 39110,
      stagingPort: 3006,
      runner: "scripts/phase35-local.mjs",
    });
    expect(ciTargets("phase4")).toMatchObject({
      user: "sprtaya_phase4",
      schemas: ["sprtaya_phase4_disposable_local", "sprtaya_phase4_disposable_test"],
      runner: "scripts/phase4-local.mjs",
      appPort: 3007,
      storagePort: 39210,
    });
    for (const unknown of ["hostinger", "production", "phase5", "mysql://example.com/db"])
      expect(() => ciTargets(unknown)).toThrow("Unknown disposable CI workstream");
  });
  it("validates stacked PRs without adding a deployment trigger or merchant secrets", () => {
    const workflow = readFileSync(".github/workflows/phase3-validation.yml", "utf8");
    expect(workflow).toContain("review/phase3-integration-20261029");
    expect(workflow).toContain("review/phase3-5-factory-commerce-20261030");
    expect(workflow).toContain("node scripts/phase3-ci.mjs --phase4");
    expect(workflow).toContain("node scripts/phase3-ci.mjs --phase35");
    expect(workflow).toContain("docs/phase35/integration-ci/");
    const script = readFileSync("scripts/phase3-ci.mjs", "utf8");
    expect(script).toContain("phase35-browser-fixtures.ts");
    expect(script).toContain("phase35-browser.mjs");
    expect(script).toMatch(/"--network"\s*,\s*"none"/);
    expect(script).toContain('"seaweed:seaweed"');
  });
});
