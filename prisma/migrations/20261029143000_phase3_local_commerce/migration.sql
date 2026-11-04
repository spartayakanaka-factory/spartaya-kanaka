-- AlterTable
ALTER TABLE `inventory_balances` ADD COLUMN `reserved` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `customer_users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `phone` VARCHAR(32) NULL,
    `locale` VARCHAR(2) NOT NULL DEFAULT 'ar',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customer_sessions_token_key`(`token`),
    INDEX `customer_sessions_userId_idx`(`userId`),
    INDEX `customer_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` LONGTEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_accounts_userId_idx`(`userId`),
    UNIQUE INDEX `customer_accounts_providerId_accountId_key`(`providerId`, `accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_verifications_identifier_idx`(`identifier`),
    INDEX `customer_verifications_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_rate_limits` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `lastRequest` BIGINT NOT NULL,

    UNIQUE INDEX `customer_rate_limits_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` CHAR(36) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `recipient` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `country` CHAR(2) NOT NULL,
    `region` VARCHAR(96) NOT NULL,
    `city` VARCHAR(96) NOT NULL,
    `line1` VARCHAR(240) NOT NULL,
    `postalCode` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_addresses_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_policies` (
    `id` VARCHAR(64) NOT NULL DEFAULT 'local-synthetic',
    `version` INTEGER NOT NULL DEFAULT 1,
    `configuration` JSON NOT NULL,
    `simulationOnly` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipping_rates` (
    `id` CHAR(36) NOT NULL,
    `country` CHAR(2) NOT NULL,
    `region` VARCHAR(96) NOT NULL,
    `carrier` VARCHAR(96) NOT NULL,
    `feeMinor` BIGINT NOT NULL,
    `codFeeMinor` BIGINT NULL,
    `codMaximumMinor` BIGINT NULL,
    `currency` CHAR(3) NOT NULL,
    `codEnabled` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `leadDays` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `shipping_rates_country_region_carrier_key`(`country`, `region`, `carrier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_carts` (
    `id` CHAR(36) NOT NULL,
    `ownerKey` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_carts_ownerKey_key`(`ownerKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_cart_items` (
    `id` CHAR(36) NOT NULL,
    `cartId` CHAR(36) NOT NULL,
    `variantId` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL,

    UNIQUE INDEX `commerce_cart_items_cartId_variantId_key`(`cartId`, `variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_orders` (
    `id` CHAR(36) NOT NULL,
    `ownerKey` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `state` VARCHAR(32) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    `paymentMethod` VARCHAR(32) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `totalMinor` BIGINT NOT NULL,
    `initialMinor` BIGINT NOT NULL,
    `paidMinor` BIGINT NOT NULL DEFAULT 0,
    `refundedMinor` BIGINT NOT NULL DEFAULT 0,
    `creditedMinor` BIGINT NOT NULL DEFAULT 0,
    `snapshot` JSON NOT NULL,
    `locale` VARCHAR(2) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `simulationOnly` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `commerce_orders_ownerKey_createdAt_idx`(`ownerKey`, `createdAt`),
    INDEX `commerce_orders_state_createdAt_idx`(`state`, `createdAt`),
    UNIQUE INDEX `commerce_orders_ownerKey_requestKey_key`(`ownerKey`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_order_items` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `variantId` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `type` VARCHAR(24) NOT NULL,
    `snapshot` JSON NOT NULL,
    `manufacturingState` VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',

    INDEX `commerce_order_items_variantId_idx`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_reservations` (
    `id` CHAR(36) NOT NULL,
    `itemId` CHAR(36) NOT NULL,
    `variantId` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `state` VARCHAR(24) NOT NULL DEFAULT 'HELD',
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_reservations_itemId_key`(`itemId`),
    INDEX `commerce_reservations_state_expiresAt_idx`(`state`, `expiresAt`),
    INDEX `commerce_reservations_variantId_state_idx`(`variantId`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_payments` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `requestKey` VARCHAR(64) NOT NULL,
    `method` VARCHAR(32) NOT NULL,
    `purpose` VARCHAR(24) NOT NULL,
    `state` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `amountMinor` BIGINT NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `providerReference` VARCHAR(191) NOT NULL,
    `claimReference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_payments_providerReference_key`(`providerReference`),
    UNIQUE INDEX `commerce_payments_orderId_requestKey_key`(`orderId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_payment_events` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` CHAR(36) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `state` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commerce_payment_events_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_finance_grants` (
    `id` CHAR(36) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `operation` VARCHAR(32) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `limitMinor` BIGINT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `commerce_finance_grants_adminId_operation_currency_key`(`adminId`, `operation`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_finance_requests` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `paymentId` CHAR(36) NULL,
    `kind` VARCHAR(32) NOT NULL,
    `amountMinor` BIGINT NOT NULL,
    `state` VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
    `requestKey` VARCHAR(64) NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `executedBy` VARCHAR(191) NULL,
    `reconciledBy` VARCHAR(191) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_finance_requests_requestKey_key`(`requestKey`),
    INDEX `commerce_finance_requests_orderId_state_idx`(`orderId`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_shipments` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `state` VARCHAR(32) NOT NULL DEFAULT 'READY',
    `carrierReference` VARCHAR(191) NULL,
    `collectionState` VARCHAR(32) NOT NULL DEFAULT 'NOT_COLLECTED',
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_shipments_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_events` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NULL,
    `actorKey` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(64) NOT NULL,
    `operationKey` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_events_operationKey_key`(`operationKey`),
    INDEX `commerce_events_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_stock_events` (
    `id` CHAR(36) NOT NULL,
    `variantId` CHAR(36) NOT NULL,
    `quantityDelta` INTEGER NOT NULL,
    `reservedDelta` INTEGER NOT NULL,
    `quantityAfter` INTEGER NOT NULL,
    `reservedAfter` INTEGER NOT NULL,
    `operationKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_stock_events_operationKey_key`(`operationKey`),
    INDEX `commerce_stock_events_variantId_createdAt_idx`(`variantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_notifications` (
    `id` CHAR(36) NOT NULL,
    `dedupKey` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(2) NOT NULL,
    `kind` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `state` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_notifications_dedupKey_key`(`dedupKey`),
    INDEX `commerce_notifications_state_leaseUntil_idx`(`state`, `leaseUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_recovery` (
    `id` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `sessionHash` CHAR(64) NULL,

    UNIQUE INDEX `commerce_recovery_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `commerce_recovery_sessionHash_key`(`sessionHash`),
    INDEX `commerce_recovery_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_sessions` ADD CONSTRAINT `customer_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `customer_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_accounts` ADD CONSTRAINT `customer_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `customer_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `customer_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commerce_cart_items` ADD CONSTRAINT `commerce_cart_items_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `commerce_carts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commerce_order_items` ADD CONSTRAINT `commerce_order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `commerce_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commerce_reservations` ADD CONSTRAINT `commerce_reservations_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `commerce_order_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commerce_payments` ADD CONSTRAINT `commerce_payments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `commerce_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commerce_events` ADD CONSTRAINT `commerce_events_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `commerce_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-reviewed safety constraints: retained in SQL because Prisma cannot express CHECK.
ALTER TABLE inventory_balances ADD CONSTRAINT p3_reserved_valid CHECK (reserved >= 0 AND reserved <= quantity);
ALTER TABLE commerce_cart_items ADD CONSTRAINT p3_cart_quantity CHECK (quantity BETWEEN 1 AND 99), ADD CONSTRAINT p3_cart_variant_fk FOREIGN KEY (variantId) REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE commerce_order_items ADD CONSTRAINT p3_order_quantity CHECK (quantity BETWEEN 1 AND 99), ADD CONSTRAINT p3_order_variant_fk FOREIGN KEY (variantId) REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE commerce_reservations ADD CONSTRAINT p3_reservation_quantity CHECK (quantity BETWEEN 1 AND 99), ADD CONSTRAINT p3_reservation_state CHECK (state IN ('HELD','COMMITTED','RELEASED','CONSUMED'));
ALTER TABLE commerce_orders ADD CONSTRAINT p3_money_valid CHECK (totalMinor > 0 AND initialMinor > 0 AND initialMinor <= totalMinor AND paidMinor >= 0 AND refundedMinor >= 0 AND refundedMinor <= paidMinor AND creditedMinor >= 0 AND creditedMinor <= totalMinor AND paidMinor <= totalMinor), ADD CONSTRAINT p3_simulation_only CHECK (simulationOnly = 1);
ALTER TABLE commerce_payments ADD CONSTRAINT p3_payment_money CHECK (amountMinor > 0);
ALTER TABLE commerce_finance_requests ADD CONSTRAINT p3_finance_money CHECK (amountMinor > 0), ADD CONSTRAINT p3_no_self_approval CHECK (approvedBy IS NULL OR approvedBy <> requestedBy), ADD CONSTRAINT p3_separate_reconciliation CHECK (reconciledBy IS NULL OR reconciledBy <> executedBy), ADD CONSTRAINT p3_finance_order_fk FOREIGN KEY(orderId) REFERENCES commerce_orders(id) ON DELETE RESTRICT;
ALTER TABLE commerce_finance_grants ADD CONSTRAINT p3_finance_limit CHECK (limitMinor > 0), ADD CONSTRAINT p3_finance_admin_fk FOREIGN KEY(adminId) REFERENCES admin_users(id) ON DELETE RESTRICT;
ALTER TABLE shipping_rates ADD CONSTRAINT p3_shipping_money CHECK (feeMinor >= 0 AND (codFeeMinor IS NULL OR codFeeMinor >= 0) AND (codMaximumMinor IS NULL OR codMaximumMinor > 0));
ALTER TABLE commerce_shipments ADD CONSTRAINT p3_shipment_order_fk FOREIGN KEY(orderId) REFERENCES commerce_orders(id) ON DELETE RESTRICT;
ALTER TABLE commerce_recovery ADD CONSTRAINT p3_recovery_order_fk FOREIGN KEY(orderId) REFERENCES commerce_orders(id) ON DELETE RESTRICT;
ALTER TABLE commerce_payment_events ADD CONSTRAINT p3_event_payment_fk FOREIGN KEY(paymentId) REFERENCES commerce_payments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX commerce_payment_claim_unique ON commerce_payments(claimReference);
