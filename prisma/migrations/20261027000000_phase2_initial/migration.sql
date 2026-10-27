-- CreateTable
CREATE TABLE `admin_users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `roleCode` VARCHAR(32) NOT NULL DEFAULT 'INVENTORY_STAFF',
    `forcePasswordChange` BOOLEAN NOT NULL DEFAULT true,
    `banned` BOOLEAN NOT NULL DEFAULT false,
    `banReason` TEXT NULL,
    `banExpires` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    INDEX `admin_users_roleCode_idx`(`roleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_roles` (
    `code` VARCHAR(32) NOT NULL,
    `nameAr` VARCHAR(80) NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_role_permissions` (
    `roleCode` VARCHAR(32) NOT NULL,
    `permission` ENUM('PRODUCTS_READ', 'PRODUCTS_WRITE', 'PRODUCTS_PUBLISH', 'CATEGORIES_READ', 'CATEGORIES_WRITE', 'MEDIA_WRITE', 'INVENTORY_READ', 'INVENTORY_ADJUST', 'SETTINGS_READ', 'SETTINGS_WRITE', 'STAFF_MANAGE', 'AUDIT_READ') NOT NULL,

    PRIMARY KEY (`roleCode`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_sessions_token_key`(`token`),
    INDEX `auth_sessions_userId_idx`(`userId`),
    INDEX `auth_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_accounts` (
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

    INDEX `auth_accounts_userId_idx`(`userId`),
    UNIQUE INDEX `auth_accounts_providerId_accountId_key`(`providerId`, `accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `auth_verifications_identifier_idx`(`identifier`),
    INDEX `auth_verifications_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_rate_limits` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `lastRequest` BIGINT NOT NULL,

    UNIQUE INDEX `auth_rate_limits_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `titleAr` VARCHAR(191) NOT NULL,
    `titleEn` VARCHAR(191) NULL,
    `descriptionAr` TEXT NOT NULL,
    `descriptionEn` TEXT NULL,
    `type` ENUM('READY_MADE', 'MADE_TO_ORDER') NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `availability` ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL DEFAULT 'UNAVAILABLE',
    `priceMinor` INTEGER NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'EGP',
    `seoTitleAr` VARCHAR(191) NULL,
    `seoTitleEn` VARCHAR(191) NULL,
    `seoDescriptionAr` VARCHAR(320) NULL,
    `seoDescriptionEn` VARCHAR(320) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    INDEX `products_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `products_type_availability_idx`(`type`, `availability`),
    FULLTEXT INDEX `products_titleAr_titleEn_descriptionAr_descriptionEn_idx`(`titleAr`, `titleEn`, `descriptionAr`, `descriptionEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variants` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `nameAr` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `sku` VARCHAR(96) NULL,
    `options` JSON NULL,
    `priceMinor` INTEGER NULL,
    `widthMm` INTEGER NULL,
    `heightMm` INTEGER NULL,
    `depthMm` INTEGER NULL,
    `weightGrams` INTEGER NULL,
    `availability` ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL DEFAULT 'UNAVAILABLE',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_variants_sku_key`(`sku`),
    INDEX `product_variants_productId_idx`(`productId`),
    UNIQUE INDEX `product_variants_productId_position_key`(`productId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `sourceUrl` VARCHAR(512) NULL,
    `slug` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NULL,
    `descriptionAr` TEXT NULL,
    `descriptionEn` TEXT NULL,
    `visible` BOOLEAN NOT NULL DEFAULT false,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `reviewRequired` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `imageAssetId` CHAR(36) NULL,
    `parentId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_sourceId_key`(`sourceId`),
    UNIQUE INDEX `categories_sourceUrl_key`(`sourceUrl`),
    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parentId_sortOrder_idx`(`parentId`, `sortOrder`),
    INDEX `categories_visible_sortOrder_idx`(`visible`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `productId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `product_categories_categoryId_position_idx`(`categoryId`, `position`),
    PRIMARY KEY (`productId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` CHAR(36) NOT NULL,
    `provider` ENUM('LEGACY_LOCAL', 'S3_COMPATIBLE') NOT NULL,
    `originalKey` VARCHAR(512) NOT NULL,
    `displayKey` VARCHAR(512) NULL,
    `publicUrl` VARCHAR(1024) NULL,
    `mimeType` VARCHAR(80) NOT NULL,
    `byteSize` INTEGER NOT NULL DEFAULT 0,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `sha256` CHAR(64) NULL,
    `altAr` VARCHAR(191) NULL,
    `altEn` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReferencedAt` DATETIME(3) NULL,

    UNIQUE INDEX `media_assets_originalKey_key`(`originalKey`),
    UNIQUE INDEX `media_assets_displayKey_key`(`displayKey`),
    INDEX `media_assets_createdAt_idx`(`createdAt`),
    INDEX `media_assets_lastReferencedAt_idx`(`lastReferencedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_media` (
    `productId` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `product_media_mediaId_idx`(`mediaId`),
    UNIQUE INDEX `product_media_productId_position_key`(`productId`, `position`),
    PRIMARY KEY (`productId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variant_media` (
    `variantId` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `variant_media_variantId_position_key`(`variantId`, `position`),
    PRIMARY KEY (`variantId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_balances` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `variantId` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `lowStockAt` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    CONSTRAINT `inventory_balances_quantity_nonnegative_check` CHECK (`quantity` >= 0),
    CONSTRAINT `inventory_balances_low_stock_nonnegative_check` CHECK (`lowStockAt` >= 0),
    UNIQUE INDEX `inventory_balances_variantId_key`(`variantId`),
    INDEX `inventory_balances_quantity_lowStockAt_idx`(`quantity`, `lowStockAt`),
    INDEX `inventory_balances_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` CHAR(36) NOT NULL,
    `balanceId` CHAR(36) NOT NULL,
    `kind` ENUM('OPENING', 'ADJUSTMENT', 'CORRECTION') NOT NULL,
    `delta` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `actorLabel` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT `inventory_movements_balance_after_nonnegative_check` CHECK (`balanceAfter` >= 0),
    INDEX `inventory_movements_balanceId_createdAt_idx`(`balanceId`, `createdAt`),
    INDEX `inventory_movements_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `manufacturing_policies` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'global',
    `productId` CHAR(36) NULL,
    `available` BOOLEAN NOT NULL DEFAULT false,
    `minProductionDays` INTEGER NOT NULL DEFAULT 1,
    `maxProductionDays` INTEGER NOT NULL DEFAULT 1,
    `depositMode` ENUM('FULL_ADVANCE', 'DEPOSIT') NOT NULL DEFAULT 'FULL_ADVANCE',
    `depositType` ENUM('FIXED_MINOR', 'PERCENT') NOT NULL DEFAULT 'FIXED_MINOR',
    `depositValue` INTEGER NOT NULL DEFAULT 0,
    `balanceCollection` ENUM('BEFORE_DISPATCH', 'CASH_ON_DELIVERY') NOT NULL DEFAULT 'BEFORE_DISPATCH',
    `codBalanceEligible` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `manufacturing_policies_productId_key`(`productId`),
    INDEX `manufacturing_policies_available_idx`(`available`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_settings` (
    `key` VARCHAR(96) NOT NULL,
    `value` JSON NOT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_events` (
    `id` CHAR(36) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorLabel` VARCHAR(191) NOT NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `beforeData` JSON NULL,
    `afterData` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_events_entity_entityId_createdAt_idx`(`entity`, `entityId`, `createdAt`),
    INDEX `audit_events_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `legacy_product_mappings` (
    `id` CHAR(36) NOT NULL,
    `sourceProductId` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(512) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'IMPORTED',
    `error` TEXT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `legacy_product_mappings_sourceProductId_key`(`sourceProductId`),
    UNIQUE INDEX `legacy_product_mappings_sourceUrl_key`(`sourceUrl`),
    UNIQUE INDEX `legacy_product_mappings_productId_key`(`productId`),
    INDEX `legacy_product_mappings_status_importedAt_idx`(`status`, `importedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `legacy_import_issues` (
    `sourceProductId` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(512) NOT NULL,
    `error` TEXT NOT NULL,
    `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `legacy_import_issues_attemptedAt_idx`(`attemptedAt`),
    PRIMARY KEY (`sourceProductId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_users` ADD CONSTRAINT `admin_users_roleCode_fkey` FOREIGN KEY (`roleCode`) REFERENCES `admin_roles`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_role_permissions` ADD CONSTRAINT `admin_role_permissions_roleCode_fkey` FOREIGN KEY (`roleCode`) REFERENCES `admin_roles`(`code`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_accounts` ADD CONSTRAINT `auth_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_imageAssetId_fkey` FOREIGN KEY (`imageAssetId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_media` ADD CONSTRAINT `product_media_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_media` ADD CONSTRAINT `product_media_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variant_media` ADD CONSTRAINT `variant_media_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variant_media` ADD CONSTRAINT `variant_media_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_balances` ADD CONSTRAINT `inventory_balances_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_balanceId_fkey` FOREIGN KEY (`balanceId`) REFERENCES `inventory_balances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `admin_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `manufacturing_policies` ADD CONSTRAINT `manufacturing_policies_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `legacy_product_mappings` ADD CONSTRAINT `legacy_product_mappings_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
