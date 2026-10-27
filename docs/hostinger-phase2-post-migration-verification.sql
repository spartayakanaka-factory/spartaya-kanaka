-- READ ONLY. Select the designated Phase 2 database in phpMyAdmin first.
-- Run only the pre-migration queries before migration; the later queries require
-- tables created by both migrations, and the final query requires owner bootstrap.

-- Identity and engine. Expected: the designated database, MariaDB 11.8.9,
-- InnoDB, foreign_key_checks=1, check_constraint_checks=1.
SELECT
  DATABASE() AS database_name,
  CURRENT_USER() AS authenticated_user,
  VERSION() AS server_version,
  @@SESSION.default_storage_engine AS default_storage_engine,
  @@SESSION.foreign_key_checks AS foreign_key_checks,
  @@SESSION.check_constraint_checks AS check_constraint_checks;

-- Before the first migration, expected: no rows and both counts = 0.
SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

SELECT COUNT(*) AS schema_object_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE();

SELECT COUNT(*) AS base_table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE';

-- After both migrations, expect 21 application tables plus _prisma_migrations.
SELECT
  TABLE_NAME AS table_name,
  ENGINE AS storage_engine,
  TABLE_COLLATION AS table_collation
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Expect both checked-in migration names, finished_at set, and no rollback.
SELECT
  migration_name,
  checksum,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count,
  logs
FROM _prisma_migrations
ORDER BY started_at, migration_name;

SELECT
  COUNT(*) AS migration_count,
  SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS completed_count,
  SUM(finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished_count,
  SUM(rolled_back_at IS NOT NULL) AS rolled_back_count
FROM _prisma_migrations;

-- Expect these three explicit inventory checks to be present.
SELECT
  tc.TABLE_NAME AS table_name,
  tc.CONSTRAINT_NAME AS constraint_name,
  cc.CHECK_CLAUSE AS check_clause
FROM information_schema.TABLE_CONSTRAINTS AS tc
JOIN information_schema.CHECK_CONSTRAINTS AS cc
  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
  AND tc.CONSTRAINT_TYPE = 'CHECK'
  AND tc.CONSTRAINT_NAME IN (
    'inventory_balances_quantity_nonnegative_check',
    'inventory_balances_low_stock_nonnegative_check',
    'inventory_movements_balance_after_nonnegative_check'
  )
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME;

-- Expect one FULLTEXT index on products.
SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name, INDEX_TYPE AS index_type
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'products'
  AND INDEX_TYPE = 'FULLTEXT';

-- After migrations but before seeding/owner bootstrap, expect all application rows to be zero.
SELECT
  (SELECT COUNT(*) FROM admin_users) AS admin_users,
  (SELECT COUNT(*) FROM admin_roles) AS admin_roles,
  (SELECT COUNT(*) FROM products) AS products,
  (SELECT COUNT(*) FROM categories) AS categories,
  (SELECT COUNT(*) FROM media_assets) AS media_assets,
  (SELECT COUNT(*) FROM inventory_balances) AS inventory_balances,
  (SELECT COUNT(*) FROM inventory_movements) AS inventory_movements;

-- After role seeding, expect 4 roles, 29 permissions, one global policy, and two store settings.
SELECT
  (SELECT COUNT(*) FROM admin_roles) AS admin_roles,
  (SELECT COUNT(*) FROM admin_role_permissions) AS role_permissions,
  (SELECT COUNT(*) FROM manufacturing_policies WHERE id = 'global') AS global_policy,
  (SELECT COUNT(*) FROM store_settings WHERE `key` IN ('phone', 'whatsapp')) AS contact_settings;

-- After the approved owner bootstrap, expect exactly one owner admin user.
SELECT id, email, roleCode, emailVerified, forcePasswordChange
FROM admin_users
ORDER BY createdAt;
