import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
describe("validation-only CI isolation",()=>{
  it("refuses ordinary execution before starting Docker or a database",()=>{
    const result=spawnSync(process.execPath,["scripts/phase3-ci.mjs"],{env:{...process.env,CI:"false",GITHUB_ACTIONS:"false"},encoding:"utf8"});
    expect(result.status).not.toBe(0);expect(result.stderr).toContain("Only an ephemeral GitHub Linux/Node22 runner");expect(result.stdout).not.toContain("Starting newly named");
  });
  it("has no push trigger, write permission, persisted Git credentials or deployment operation",()=>{
    const workflow=readFileSync(".github/workflows/phase3-validation.yml","utf8");
    expect(workflow).toContain("pull_request:");expect(workflow).toContain("contents: read");expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toMatch(/\bpush:|pull_request_target:|contents:\s*write|secrets\.|hosting_deploy|hostinger\s+(?:up|deploy)|migrate deploy/i);
    expect(workflow).toContain("node scripts/phase3-ci.mjs");
  });
});
