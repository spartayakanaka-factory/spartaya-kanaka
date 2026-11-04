-- CreateTable
CREATE TABLE `commerce_cancellations` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `state` VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
    `reviewedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `commerce_cancellations_orderId_key`(`orderId`),
    INDEX `commerce_cancellations_state_createdAt_idx`(`state`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE commerce_cancellations ADD CONSTRAINT p3_cancellation_order_fk FOREIGN KEY(orderId) REFERENCES commerce_orders(id) ON DELETE RESTRICT;
