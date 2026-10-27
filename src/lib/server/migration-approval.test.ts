import { describe, expect, it } from "vitest";
import {
  requireEmptyHostingerPhase2Target,
  requireHostingerMigrationApproval,
} from "../../../scripts/migration-approval";

const backupReference = `sha256:${"a".repeat(64)}`;
const approvedArguments = [
  "--confirm-hostinger-phase2-test",
  "--approve-reviewed-staging",
  "--expect-empty-database",
  `--backup-reference=${backupReference}`,
];

describe("Hostinger migration approval gate", () => {
  it("requires an exact target confirmation, reviewed-staging approval, and backup digest", () => {
    expect(requireHostingerMigrationApproval(approvedArguments)).toBe(backupReference);
    expect(() => requireHostingerMigrationApproval(approvedArguments.slice(1))).toThrow(
      /confirm-hostinger-phase2-test/,
    );
    expect(() => requireHostingerMigrationApproval(approvedArguments.slice(0, 1))).toThrow(
      /approve-reviewed-staging/,
    );
    expect(() => requireHostingerMigrationApproval(approvedArguments.slice(0, 2))).toThrow(
      /file digest/,
    );
  });

  it("rejects placeholders and malformed backup digests", () => {
    for (const reference of [
      "PASTE_BACKUP_REFERENCE_HERE",
      `sha256:${"g".repeat(64)}`,
      "sha256:123",
    ]) {
      const args = [
        "--confirm-hostinger-phase2-test",
        "--approve-reviewed-staging",
        `--backup-reference=${reference}`,
      ];
      expect(() => requireHostingerMigrationApproval(args)).toThrow(/file digest/);
    }
  });

  it("allows only the empty initial target with both reviewed migrations pending", () => {
    expect(() =>
      requireEmptyHostingerPhase2Target(approvedArguments, {
        tableCount: 0,
        appliedMigrations: [],
        pendingMigrations: [
          "20261027000000_phase2_initial",
          "20261027120000_phase2_2_review_safety",
        ],
      }),
    ).not.toThrow();

    for (const state of [
      {
        tableCount: 1,
        appliedMigrations: [],
        pendingMigrations: [
          "20261027000000_phase2_initial",
          "20261027120000_phase2_2_review_safety",
        ],
      },
      {
        tableCount: 1,
        appliedMigrations: ["20261027000000_phase2_initial"],
        pendingMigrations: ["20261027120000_phase2_2_review_safety"],
      },
      { tableCount: 0, appliedMigrations: [], pendingMigrations: ["unreviewed_migration"] },
    ]) {
      expect(() => requireEmptyHostingerPhase2Target(approvedArguments, state)).toThrow(
        /expected empty database/,
      );
    }
  });
});
