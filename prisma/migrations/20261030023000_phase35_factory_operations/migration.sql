-- DropIndex
DROP INDEX `shipping_rates_country_region_carrier_key` ON `shipping_rates`;

-- AlterTable
ALTER TABLE `customer_addresses` ADD COLUMN `area` VARCHAR(96) NULL,
    ADD COLUMN `deliveryInstructions` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `shipping_rates` ADD COLUMN `area` VARCHAR(96) NOT NULL DEFAULT '',
    ADD COLUMN `city` VARCHAR(96) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `commerce_payments` ADD COLUMN `customerExplanation` VARCHAR(500) NULL,
    ADD COLUMN `evidenceRequired` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `instructionsSnapshot` JSON NULL;

-- AlterTable
ALTER TABLE `commerce_notifications` ADD COLUMN `lastErrorCode` VARCHAR(64) NULL,
    ADD COLUMN `nextAttemptAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `commerce_payment_evidence` (
    `id` CHAR(36) NOT NULL,
    `paymentId` CHAR(36) NOT NULL,
    `requestKey` VARCHAR(64) NOT NULL,
    `revision` INTEGER NOT NULL,
    `ownerKey` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `mime` VARCHAR(32) NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_payment_evidence_storageKey_key`(`storageKey`),
    UNIQUE INDEX `commerce_payment_evidence_sha256_key`(`sha256`),
    UNIQUE INDEX `commerce_payment_evidence_paymentId_requestKey_key`(`paymentId`, `requestKey`),
    UNIQUE INDEX `commerce_payment_evidence_paymentId_revision_key`(`paymentId`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commerce_order_notes` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `text` VARCHAR(1500) NOT NULL,
    `requestKey` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commerce_order_notes_requestKey_key`(`requestKey`),
    INDEX `commerce_order_notes_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `shipping_destination_carrier_unique` ON `shipping_rates`(`country`, `region`, `city`, `area`, `carrier`);

-- AddForeignKey
ALTER TABLE `commerce_payment_evidence` ADD CONSTRAINT `commerce_payment_evidence_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `commerce_payments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `commerce_order_notes` ADD CONSTRAINT `commerce_order_notes_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `commerce_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `commerce_order_notes` ADD CONSTRAINT `commerce_order_notes_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Bounded immutable evidence and note payloads.
ALTER TABLE commerce_payment_evidence ADD CONSTRAINT phase35_evidence_dimensions CHECK (revision > 0 AND byteSize > 0 AND byteSize <= 5242880 AND width > 0 AND width <= 1600 AND height > 0 AND height <= 1600);
ALTER TABLE commerce_order_notes ADD CONSTRAINT phase35_note_kind CHECK (kind IN ('INTERNAL','MANUFACTURING'));
