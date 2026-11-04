import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  requirePhase55Initialization,
  reviewedPhase55Migrations,
} from "../../../scripts/phase55-migration-plan";
const source = "a".repeat(40),
  digest = "sha256:" + "b".repeat(64),
  reviewed = reviewedPhase55Migrations(process.cwd()),
  state = { tableCount: 0, appliedMigrations: [], pendingMigrations: reviewed.map((m) => m.name) };
const args = [
  "--apply",
  "--confirm-hostinger-phase2-test",
  "--approve-reviewed-staging",
  "--expect-empty-database",
  "--approve-phase55-initialization",
  "--backup-reference=" + digest,
  "--restore-verified=" + digest,
  "--approved-source=" + source,
];
describe("Separately approved seven-migration staging initialization", () => {
  it("accepts the exact reviewed empty plan and matching backup/restore/source attestations", () => {
    expect(requirePhase55Initialization(args, source, state, reviewed)).toEqual({
      backupReference: digest,
      source,
    });
    expect(reviewed).toHaveLength(7);
  });
  it("rejects every missing attestation before any migration can be invoked", () => {
    for (const flag of args)
      expect(() =>
        requirePhase55Initialization(
          args.filter((a) => a !== flag),
          source,
          state,
          reviewed,
        ),
      ).toThrow();
  });
  it("rejects existing tables, applied history, partial plans, unknown source and mismatched restore digest", () => {
    for (const patch of [
      { tableCount: 1 },
      { appliedMigrations: ["old"] },
      { pendingMigrations: state.pendingMigrations.slice(0, 2) },
    ])
      expect(() =>
        requirePhase55Initialization(args, source, { ...state, ...patch }, reviewed),
      ).toThrow();
    expect(() => requirePhase55Initialization(args, "c".repeat(40), state, reviewed)).toThrow();
    expect(() =>
      requirePhase55Initialization(
        args.map((a) =>
          a.startsWith("--restore-verified=") ? "--restore-verified=sha256:" + "d".repeat(64) : a,
        ),
        source,
        state,
        reviewed,
      ),
    ).toThrow();
  });
  it("rejects changed SQL or unknown migration directories in a disposable copy", () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "p55-migration-plan-"));
    try {
      mkdirSync(path.join(temp, "docs/phase4"), { recursive: true });
      writeFileSync(
        path.join(temp, "docs/phase4/migration-manifest.json"),
        readFileSync("docs/phase4/migration-manifest.json"),
      );
      for (const m of reviewed) {
        mkdirSync(path.join(temp, "prisma/migrations", m.name), { recursive: true });
        writeFileSync(
          path.join(temp, "prisma/migrations", m.name, "migration.sql"),
          readFileSync(path.join("prisma/migrations", m.name, "migration.sql")),
        );
      }
      const file = path.join(temp, "prisma/migrations", reviewed[0].name, "migration.sql");
      writeFileSync(file, readFileSync(file, "utf8") + "\n-- changed\n");
      expect(() => reviewedPhase55Migrations(temp)).toThrow("checksum");
      writeFileSync(
        file,
        readFileSync(path.join("prisma/migrations", reviewed[0].name, "migration.sql")),
      );
      mkdirSync(path.join(temp, "prisma/migrations/unknown"));
      expect(() => reviewedPhase55Migrations(temp)).toThrow("inventory");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
