-- Record explicit human review before a product can be published.
ALTER TABLE `products`
  ADD COLUMN `detailsReviewedAt` DATETIME(3) NULL;

-- Make inventory form replays safe, including concurrent duplicate requests.
ALTER TABLE `inventory_movements`
  ADD COLUMN `requestKey` VARCHAR(64) NULL,
  ADD UNIQUE INDEX `inventory_movements_requestKey_key` (`requestKey`);
