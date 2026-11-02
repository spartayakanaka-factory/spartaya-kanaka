-- Future separately approved exact-target verification only. Not executed in Phase 6.
-- Use the internal private Hostinger connection; never paste credentials into this file.
SELECT DATABASE() AS database_name, CURRENT_USER() AS authenticated_user,
       VERSION() AS server_version, @@port AS server_port,
       @@default_storage_engine AS default_engine,
       @@foreign_key_checks AS foreign_keys_enabled,
       @@check_constraint_checks AS check_constraints_enabled;

SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

SELECT COUNT(*) AS migration_ledger_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_prisma_migrations';

-- Run the following statement ONLY after confirming that the ledger exists.
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
       applied_steps_count
FROM _prisma_migrations ORDER BY migration_name;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, CONSTRAINT_TYPE, CONSTRAINT_NAME;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Keep grants output private. This does not change privileges.
SHOW GRANTS FOR CURRENT_USER;

-- After separately approved Gate 4 import/rerun; compare before/after snapshots.
SELECT status, COUNT(*) AS original_products,
       SUM(priceMinor IS NOT NULL) AS originals_with_operational_prices
FROM products
WHERE id IN (SELECT productId FROM legacy_product_mappings)
GROUP BY status;
