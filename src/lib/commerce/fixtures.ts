import type { PrismaClient } from "@/generated/prisma/client";
import { newManufacturingTemplate } from "./policy";
export const syntheticPolicy = {
  currency: "EGP",
  taxMode: "EXCLUSIVE",
  taxRateBps: 1400,
  taxRounding: "HALF_UP_LINE",
  discountMode: "DISABLED",
  depositRounding: "CEILING_LINE",
  shippingTaxable: false,
  shippingCollection: "UPFRONT",
  codShippingCollection: "AT_DELIVERY",
  fixedDepositBasis: "PER_LINE",
  mixedCart: "SPLIT_REQUIRED",
  balanceDue: "BEFORE_DISPATCH",
  holdSeconds: 300,
  manualHoldSeconds: 900,
  allowGuest: true,
  syntheticGuestContact: true,
  allowUnpaidCancellation: true,
  allowMockRefunds: true,
  financeSelfApproval: false,
  distinctReconciler: true,
  international: false,
  externalNotifications: false,
} as const;
export async function fixturePolicy(db: PrismaClient) {
  return db.commercePolicy.upsert({
    where: { id: "local-synthetic" },
    create: { configuration: syntheticPolicy },
    update: { configuration: syntheticPolicy, version: { increment: 1 } },
  });
}
export async function fixtureProduct(
  db: PrismaClient,
  suffix: string,
  type: "READY_MADE" | "MADE_TO_ORDER" = "READY_MADE",
  quantity = 5,
  price = 10001,
) {
  const p = await db.product.create({
    data: {
      slug: "p3-synthetic-" + suffix,
      titleAr: "قطعة نحاس اصطناعية للاختبار فقط",
      titleEn: "Synthetic copper test piece",
      descriptionAr:
        "منتج اصطناعي للاختبار المحلي فقط. الصورة الأصلية توضيحية وليست تسعيراً لمنتج المصنع.",
      descriptionEn:
        "Synthetic local fixture. Original photo illustrates the test only and is not an offer for the factory product.",
      type,
      status: "PUBLISHED",
      availability: "AVAILABLE",
      priceMinor: price,
      detailsReviewedAt: new Date(),
      featured: true,
      variants: {
        create: { nameAr: "متغير اختباري", nameEn: "Test variation", availability: "AVAILABLE" },
      },
    },
    include: { variants: true },
  });
  const v = p.variants[0];
  if (type === "READY_MADE")
    await db.inventoryBalance.create({ data: { productId: p.id, variantId: v.id, quantity } });
  else
    await db.manufacturingPolicy.create({
      data: {
        id: p.id,
        productId: p.id,
        available: true,
        minProductionDays: 1,
        maxProductionDays: 7,
        ...newManufacturingTemplate(),
      },
    });
  return { ...p, variantId: v.id };
}
export async function fixtureRate(db: PrismaClient, region = "TEST-CAIRO") {
  return db.shippingRate.upsert({
    where: {
      country_region_city_area_carrier: {
        country: "EG",
        region,
        city: "",
        area: "",
        carrier: "SYNTHETIC-CARRIER",
      },
    },
    create: {
      country: "EG",
      region,
      carrier: "SYNTHETIC-CARRIER",
      feeMinor: BigInt(2500),
      currency: "EGP",
      enabled: true,
      leadDays: 3,
      codEnabled: true,
      codFeeMinor: BigInt(500),
      codMaximumMinor: BigInt(1000000),
    },
    update: {},
  });
}
