#!/usr/bin/env python3
"""Restore a private Phase 2 export and rehearse promotion only on port 33078.

Never connects to port 33077 or Hostinger. Requires an existing private export.
All newly created schemas/accounts are fixed aliases and removed afterward.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("sprtaya_phase2_local", "sprtaya_phase2_test")
TARGETS = ("sprtaya_phase35_rehearsal_local", "sprtaya_phase35_rehearsal_test")
RECOVERY = ("sprtaya_phase35_recovery_local", "sprtaya_phase35_recovery_test")
USER = "sprtaya_phase35_rehearsal"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-disposable-rehearsal", action="store_true", required=True)
    parser.add_argument("--phase2-backup", type=Path, required=True)
    args = parser.parse_args()
    private = Path(os.environ["P3_STATE_DIR"]).resolve()
    source_dir = (Path(os.environ["P2_RUNTIME_DIR"]) / "backups").resolve()
    backup = args.phase2_backup.resolve()
    if backup.parent != source_dir or backup.suffix != ".sql" or backup.stat().st_mode & 0o077:
        raise RuntimeError("An existing private Phase 2 backup is required.")
    os.environ["P3_STATE_DIR"] = os.environ["P35_DB_SERVICE_DIR"]
    spec = importlib.util.spec_from_file_location("disposable_db", ROOT / "scripts/phase3-db.py")
    local = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(local)
    os.environ["P3_STATE_DIR"] = str(private)
    identity = local.query("SELECT @@port, VERSION(), @@bind_address;").strip().split("\t")
    if identity != ["33078", "11.8.9-MariaDB", "127.0.0.1"]:
        raise RuntimeError("The isolated MariaDB identity does not match.")
    for database in TARGETS + RECOVERY:
        if local.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + database + "';").strip():
            raise RuntimeError("A rehearsal target exists; refusing overwrite.")
    if local.query("SELECT User FROM mysql.user WHERE User='" + USER + "';").strip():
        raise RuntimeError("A rehearsal user exists; refusing reuse.")
    artifact = backup.read_text()
    selectors = re.findall(r"^(?:CREATE DATABASE[^\n]*|USE [^\n]*)$", artifact, re.M)
    if len(selectors) != 4 or any(not any("`" + name + "`" in line for name in SOURCES) for line in selectors):
        raise RuntimeError("Unexpected source database selectors.")
    # Refuse cross-schema executable constructs; this is a trusted plain table dump.
    if re.search(r"\b(?:CREATE\s+(?:USER|TRIGGER|PROCEDURE|FUNCTION|EVENT)|GRANT|DEFINER\s*=)\b", artifact, re.I):
        raise RuntimeError("Executable/account objects need separate review.")

    def restore(names):
        rewritten = artifact
        for source, target in zip(SOURCES, names):
            rewritten = re.sub(r"^(CREATE DATABASE[^\n]*?|USE )`" + re.escape(source) + r"`", lambda m: m.group(1) + "`" + target + "`", rewritten, flags=re.M)
        result = subprocess.run(local.client_args(), input=rewritten.encode(), env=local.runtime_env(), capture_output=True)
        if result.returncode:
            raise RuntimeError("Private export restoration failed; no SQL contents logged.")

    def snapshot(database, columns=None):
        if columns is None:
            columns = {}
            for row in local.query("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + database + "' AND TABLE_NAME<>'_prisma_migrations' ORDER BY TABLE_NAME,ORDINAL_POSITION;").splitlines():
                table, column = row.split("\t")
                columns.setdefault(table, []).append(column)
        result = {}
        for table, fields in columns.items():
            if not all(re.fullmatch(r"[A-Za-z0-9_]+", value) for value in [table, *fields]):
                raise RuntimeError("Unsafe snapshot identifier.")
            values = local.query("SELECT " + ",".join("`" + f + "`" for f in fields) + " FROM `" + database + "`.`" + table + "`;").splitlines()
            result[table] = {"rows": len(values), "sha256": hashlib.sha256("\n".join(sorted(values)).encode()).hexdigest()}
        return columns, result

    password = secrets.token_hex(32)
    evidence = {"scope": "Disposable loopback 33078 only; accepted and hosted databases never connected", "backupSha256": hashlib.sha256(backup.read_bytes()).hexdigest(), "databases": []}
    try:
        restore(TARGETS)
        local.query("CREATE USER '" + USER + "'@'127.0.0.1' IDENTIFIED BY '" + password + "';" + "".join("GRANT ALL ON `" + name + "`.* TO '" + USER + "'@'127.0.0.1';" for name in TARGETS))
        for database in TARGETS:
            columns, before = snapshot(database)
            initial_history = local.query("SELECT migration_name,checksum FROM `" + database + "`._prisma_migrations ORDER BY migration_name;").splitlines()
            if len(initial_history) != 2:
                raise RuntimeError("Expected exactly the two Phase 2 migrations.")
            env = {**os.environ, "DATABASE_URL": "mysql://" + USER + ":" + password + "@127.0.0.1:33078/" + database}
            env.update({"DATABASE_TARGET":"local","APP_ENV":"local","STAGING_SITE":"0"})
            certificate = private / "promotion-certificates" / (database + "-before.json")
            check = subprocess.run([os.environ.get("P3_NODE_BINARY","node"),"--import","tsx","scripts/phase3-promotion-check.ts","preflight","--out",str(certificate)],cwd=ROOT,env=env,capture_output=True)
            if check.returncode: raise RuntimeError("Independent read-only preflight failed.")
            for run in range(2):
                result = subprocess.run([os.environ.get("P3_NODE_BINARY", "node"), "node_modules/prisma/build/index.js", "migrate", "deploy"], cwd=ROOT, env=env, capture_output=True)
                if result.returncode:
                    raise RuntimeError("Disposable Prisma deployment failed; private diagnostics retained only in memory.")
            check = subprocess.run([os.environ.get("P3_NODE_BINARY","node"),"--import","tsx","scripts/phase3-promotion-check.ts","postflight","--baseline",str(certificate),"--out",str(certificate.with_name(database+"-after.json"))],cwd=ROOT,env=env,capture_output=True)
            if check.returncode: raise RuntimeError("Independent read-only postflight failed.")
            if snapshot(database, columns)[1] != before:
                raise RuntimeError("Promotion changed existing Phase 2 row data.")
            history = local.query("SELECT migration_name,checksum FROM `" + database + "`._prisma_migrations ORDER BY migration_name;").splitlines()
            manifest = json.loads((ROOT / "docs/phase3/migration-manifest.json").read_text())
            if len(history) != len(manifest["migrations"]) or not all(row in history for row in initial_history):
                raise RuntimeError("Migration history preservation failed.")
            if dict(row.split("\t") for row in history) != {m["name"]: m["sha256"] for m in manifest["migrations"]}:
                raise RuntimeError("Applied migration checksums differ.")
            if local.query("SELECT COUNT(*) FROM `" + database + "`.inventory_balances WHERE reserved<>0;").strip() != "0":
                raise RuntimeError("Unexpected reservation backfill.")
            evidence["databases"].append({"target": database, "phase2TablesPreserved": len(before), "legacyMappings": before["legacy_product_mappings"]["rows"], "before": before, "migrationHistory": [row.split("\t")[0] for row in history], "secondDeployIdempotent": True, "initialReservationsZero": True})
        # The empty Phase 2 test copy is disposable: exercise the actual CLI,
        # including its external persistent archive root, then a no-change rerun.
        empty = TARGETS[1]
        env = {**os.environ, "DATABASE_URL": "mysql://" + USER + ":" + password + "@127.0.0.1:33078/" + empty, "DATABASE_TARGET": "local", "APP_ENV": "local", "STAGING_SITE": "0", "NODE_ENV": "test"}
        for run in range(2):
            result = subprocess.run([os.environ.get("P3_NODE_BINARY", "node"), "--import", "tsx", "scripts/import-legacy-catalog.ts", "--apply"], cwd=ROOT, env=env, capture_output=True)
            if result.returncode:
                raise RuntimeError("Disposable importer CLI failed; no private SQL logged.")
            summary = json.loads(result.stdout)
            if summary.get("issues"):
                raise RuntimeError("Importer reported unresolved image/catalog issues.")
            if local.query("SELECT COUNT(*) FROM `" + empty + "`.products WHERE status='DRAFT' AND priceMinor IS NULL;").strip() != "487":
                raise RuntimeError("Draft-only importer invariant failed.")
            if run == 0:
                _, imported = snapshot(empty)
            elif snapshot(empty)[1] != imported:
                raise RuntimeError("Importer rerun changed existing rows.")
        evidence["importer"] = {"actualCliRuns": 2, "drafts": 487, "inventedPrices": 0, "externalArchiveRoot": True, "secondRunPreservedAllRows": True}
        restore(RECOVERY)
        for promoted, restored in zip(evidence["databases"], RECOVERY):
            if snapshot(restored)[1] != promoted["before"]:
                raise RuntimeError("Pre-promotion recovery differs from the saved artifact.")
            promoted["backupRecoveryVerified"] = True
        output = ROOT / "docs/phase35/promotion-rehearsal.json"
        output.write_text(json.dumps(evidence, indent=2) + "\n")
        print("PASS disposable promotion, rerun, baseline preservation and exact-artifact recovery.")
    finally:
        for name in TARGETS + RECOVERY:
            local.query("DROP DATABASE IF EXISTS `" + name + "`;")
        local.query("DROP USER IF EXISTS '" + USER + "'@'127.0.0.1';")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error))
        raise SystemExit(1)
