# Database promotion and recovery procedure — preparation only

No command in this document authorizes a persistent migration. The tested disposable rehearsal is `scripts/phase3-promotion-rehearsal.py`; its evidence is `promotion-rehearsal.json`.

## Reviewed schema

Preserve both historical migrations exactly:

- `20261027000000_phase2_initial`
- `20261027120000_phase2_2_review_safety`

The two additive Phase 3 migrations are:

- `20261029143000_phase3_local_commerce`: separate customer/auth/cart/order/payment/refund/reservation/shipment/grant/audit/outbox structures; `inventory_balances.reserved` defaults to zero with CHECK protection.
- `20261029144500_phase3_cancellation_review`: cancellation review records.

Exact SHA-256 values remain in `../migration-manifest.json`. This integration changes no SQL migration or Prisma schema relative to the audited Phase 3 implementation. MariaDB 11.8.9 accepted all four migrations during the rehearsal. Existing 487 imported drafts, absent prices, manufacturing terms, catalog/media mappings, stock, staff and settings were compared as complete original-column row digests before/after promotion. The old two history rows and checksums were retained; the new two rows were added by Prisma itself. A second deploy had no pending migrations.

The actual importer CLI also uses `LEGACY_ASSET_ROOT`, like the repaired asset route. Its separate empty disposable copy receives 487 drafts with no prices and is rerun to check idempotency. No existing catalog import or customer data is touched.

## Reproduce locally

Use the documented isolated MariaDB 11.8.9 on port 33078 and an existing private Phase 2 export. Configure `P3_STATE_DIR` and `P2_RUNTIME_DIR` to private local directories, put the verified Node 22 binary on PATH, and set `LEGACY_ASSET_ROOT` to the preserved archive root. From the integration tree:

```sh
python3 scripts/phase3-promotion-rehearsal.py \
  --run-disposable-rehearsal \
  --phase2-backup /PRIVATE/phase2/backups/REVIEWED.sql
```

This script never connects to port 33077 or 3306. It checks version/bind address/port, refuses pre-existing aliases/accounts, restores only fixed new `sprtaya_phase3_rehearsal_*` schemas, grants a fresh random user only those schemas, executes Prisma deploy twice, and compares data. It restores the exact saved pre-promotion artifact again into fixed `sprtaya_phase3_recovery_*` schemas. Only these newly created aliases/account are removed afterward. Export contents and credentials stay private.

## Persistent staging gates — all pending separate approval

1. **Freeze and identify.** Keep the existing working Phase 2 application restricted. Confirm actual database state afresh; previous empty-table reports are historical. Read-only SQL: `SELECT DATABASE(), CURRENT_USER(), VERSION(), @@port, @@default_storage_engine, @@foreign_key_checks, @@check_constraint_checks;`. Expected designated target: `u858869017_sprtaya_phase2`, its designated test user, Hostinger-internal `127.0.0.1:3306`, MariaDB 11.8.9. Reject unknown targets and disabled FK/CHECK enforcement.
2. **Inspect schema/history.** Read information_schema tables/indexes/constraints; inspect `_prisma_migrations` only if it exists. Two completed matching Phase 2 migrations permit planning the two additive migrations. An empty database instead requires explicit approval for all four migrations, not an assumption that Phase 2 exists. Any unmanaged, failed, duplicate, modified or unknown history stops the procedure. Do not use `db push`, `migrate reset`, `migrate dev`, hand-insert history rows or blindly run `migrate resolve`.
3. **Verified backup.** Quiesce writes, take a full transaction-consistent export including history and all relevant objects, download to trusted private storage, calculate SHA-256, retain a separately stored copy, and perform an exact-artifact restore into a separately approved isolated recovery target. Compare table inventory, counts and data digests. Record database identity, time, migration checksums and export digest; never put the SQL or credentials in Git. A checksum by itself is not restore verification. MariaDB DDL is not an all-or-nothing transaction across the whole migration.
4. **Approve execution.** Supply the read-only preflight results, restore certificate, exact candidate commit, exact pending migration names/digests, maintenance window and recovery method for E1 approval. Choose an execution method actually supported by this Hostinger account, without unrestricted Remote MySQL. A temporary deployment build command changes a hosted deployment and requires its own explicit approval. No existing guard is a runnable Phase 3 staging migration command: all legacy entry points deliberately refuse and `scripts/phase3 migrate` remains disposable-only. A narrowly scoped promotion runner must be reviewed/authorized before persistent execution; raw CLI commands are not a bypass.
5. **Execute only after approval.** The approved guarded runner should recheck identity/history/export certificate and schema manifest immediately before invoking pinned `prisma migrate deploy`, with no reset or seed/import/bootstrap hook. Keep Phase 3 financial/customer gates disabled. A normal application build never migrates. Capture sanitized execution evidence. Stop at the first failed migration; inspect actual DDL/history before any recovery or retry.
6. **Verify before switching app.** Require four completed history rows with exact manifest checksums, no failed/rolled-back entries, all expected tables/FKs/CHECKs/indexes, reserved=0 for baseline rows, and unchanged existing-column row digests. Invariants: `reserved >= 0 AND reserved <= quantity`; reservations/orders/payment/refund references valid; no new owner, price, stock or manufacturing-policy backfill. Read-only Prisma diff must be empty. Only then separately approve the application deployment and restricted synthetic acceptance.

## Rollback and failure recovery

Do not generate/apply a destructive down migration. Stop writers/workers, preserve the failed database and logs, and assess completed DDL/history. Prefer a forward repair with a fresh reviewed backup. For a restore, use the exact verified pre-change export in a separate approved database, verify it, pair it with the matching old application/client, and authorize the switch separately. Do not restore over existing staging data or reassign Hostinger's database automatically.

The Phase 3 Prisma client reads new fields even with commerce flags off. Reverting code and restoring schema are separate coordinated decisions; flag changes alone are not a rollback strategy. If any real orders existed, restoring an earlier export could lose transactions and requires reconciliation/recovery beyond this synthetic rehearsal.
