// Phase 5.5 reuses only the dedicated Phase 5 disposable local schemas and S3.
import { spawnSync } from "node:child_process";
import path from "node:path";
const r = spawnSync(process.execPath, ["scripts/phase5-local.mjs", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    P5_STATE_DIR: path.resolve("../../phase5/runtime"),
    P5_PRODUCT_EVIDENCE_DIR: "docs/phase55/product-browser",
    P5_UI_EVIDENCE_DIR: "docs/phase55",
    P35_EVIDENCE_DIR: "docs/phase55/factory-browser",
    P5_ACCEPTANCE_DIR: "docs/phase55",
  },
});
process.exitCode = r.status ?? 1;
