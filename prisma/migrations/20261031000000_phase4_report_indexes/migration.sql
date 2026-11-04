-- Additive reporting indexes. Rehearse on disposable MariaDB only.
CREATE INDEX `p4_orders_created_idx` ON `commerce_orders`(`createdAt`);
CREATE INDEX `p4_events_kind_created_idx` ON `commerce_events`(`kind`, `createdAt`);
