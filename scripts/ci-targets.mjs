// Finite disposable CI contracts. No URL, schema, port or command can be supplied by callers.
export function ciTargets(mode) {
  if (!["phase3", "phase35"].includes(mode)) throw Error("Unknown disposable CI workstream");
  const phase35 = mode === "phase35";
  return {
    phase35,
    user: phase35 ? "sprtaya_phase35" : "sprtaya_phase3",
    schemas: phase35
      ? ["sprtaya_phase35_disposable_local", "sprtaya_phase35_disposable_test"]
      : ["sprtaya_phase3_disposable_local", "sprtaya_phase3_disposable_test"],
    runner: phase35 ? "scripts/phase35-local.mjs" : "scripts/phase3.mjs",
    appPort: phase35 ? 3005 : 3003,
    storagePort: phase35 ? 39110 : 39010,
    stagingPort: phase35 ? 3006 : 3005,
    evidence: phase35 ? "docs/phase35/integration-ci" : "docs/phase3/master-execution/ci",
  };
}
