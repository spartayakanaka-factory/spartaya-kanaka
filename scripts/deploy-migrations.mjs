// Compatibility entry point retained from the canonical branch. Do not let an old
// build hook bypass the separately reviewed Phase 3 disposable migration runner.
throw new Error("Phase 3 promotion is blocked. Use scripts/phase3 migrate for the reviewed disposable-only preflight.");
