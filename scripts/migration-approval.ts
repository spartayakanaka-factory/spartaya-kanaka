export function requireHostingerMigrationApproval(argumentsList: string[]) {
  if (!argumentsList.includes("--confirm-hostinger-phase2-test")) {
    throw new Error("Hostinger test migrations require --confirm-hostinger-phase2-test.");
  }
  if (!argumentsList.includes("--approve-reviewed-staging")) {
    throw new Error(
      "Review the staging environment, then explicitly pass --approve-reviewed-staging.",
    );
  }
  const backupReference = argumentsList
    .find((argument) => argument.startsWith("--backup-reference="))
    ?.slice("--backup-reference=".length)
    .trim();
  if (!backupReference || !/^sha256:[a-f0-9]{64}$/i.test(backupReference)) {
    throw new Error(
      "Export the designated database first, then pass its file digest as --backup-reference=sha256:<64-hex-digest>.",
    );
  }
  return backupReference;
}

const expectedInitialMigrations = [
  "20261027000000_phase2_initial",
  "20261027120000_phase2_2_review_safety",
];

export function requireEmptyHostingerPhase2Target(
  argumentsList: string[],
  state: { tableCount: number; appliedMigrations: string[]; pendingMigrations: string[] },
) {
  if (!argumentsList.includes("--expect-empty-database")) {
    throw new Error("Initial Hostinger Phase 2 migrations require --expect-empty-database.");
  }
  if (
    state.tableCount !== 0 ||
    state.appliedMigrations.length !== 0 ||
    state.pendingMigrations.length !== expectedInitialMigrations.length ||
    expectedInitialMigrations.some((name, index) => state.pendingMigrations[index] !== name)
  ) {
    throw new Error(
      "The Hostinger Phase 2 target is not the expected empty database with both reviewed initial migrations pending; stop for manual review.",
    );
  }
}
