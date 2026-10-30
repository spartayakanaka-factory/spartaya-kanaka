import {spawnSync} from "node:child_process";
import {describe,it,expect} from "vitest";
describe("Phase 3 cannot leak through accepted migration entry points",()=>{
 for(const file of ["scripts/deploy-migrations.ts","scripts/migrate-dev.mjs","scripts/deploy-migrations.mjs"]){
  it("blocks "+file+" before spawning Prisma or connecting",()=>{
   const result=spawnSync(process.execPath,["--import","tsx",file],{cwd:process.cwd(),env:{...process.env,DATABASE_TARGET:"local",DATABASE_URL:"mysql://unused:unused@127.0.0.1:33077/sprtaya_phase2_test"},encoding:"utf8"});
   expect(result.status).not.toBe(0);expect(result.stderr).toContain("Phase 3 promotion is blocked");expect(result.stdout).not.toContain("Prisma schema loaded");
  });
 }
});
