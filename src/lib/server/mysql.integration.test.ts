import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeDatabaseTarget } from "../../../scripts/database-target";
import { createRuntimeDatabase } from "../../../scripts/runtime-db";
import {
  buildLegacyProductDraft,
  createLegacyProductIfUnmapped,
  type LegacyProduct,
} from "../catalog-import";
import { assertCompatibleDatabaseVersion } from "./database-engine";
import { getAuth } from "./auth";
import type { PrismaClient } from "@/generated/prisma/client";

const hostingerAcceptanceApproval = "CONFIRM_SYNTHETIC_TEST_WRITES";
const hostingerAcceptance =
  process.env.DATABASE_TARGET === "hostinger-phase2-test" &&
  process.env.PHASE2_HOSTINGER_ACCEPTANCE === hostingerAcceptanceApproval;
const enabled =
  process.env.PHASE2_DB_INTEGRATION === "1" &&
  (process.env.DATABASE_TARGET === "local" || hostingerAcceptance);

function assertIsolatedTestDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Database integration tests require DATABASE_URL.");
  }

  if (process.env.DATABASE_TARGET === "hostinger-phase2-test") {
    if (!hostingerAcceptance) {
      throw new Error(
        "Hostinger database tests require PHASE2_HOSTINGER_ACCEPTANCE=CONFIRM_SYNTHETIC_TEST_WRITES.",
      );
    }
    assertSafeDatabaseTarget({ allowHostingerPhase2Test: true });
    return;
  }

  assertSafeDatabaseTarget();
  if (process.env.DATABASE_TARGET !== "local") {
    throw new Error("Database integration tests require DATABASE_TARGET=local.");
  }
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname.toLowerCase()) ||
    !/(?:^|[_-])(?:test|integration)(?:$|[_-])/.test(database)
  ) {
    throw new Error(
      "Database integration tests require a loopback MySQL database named with a test or integration suffix.",
    );
  }
}

const databaseSuite = describe.skipIf(!enabled);

databaseSuite("MySQL/MariaDB integration acceptance", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    assertIsolatedTestDatabase();
    db = createRuntimeDatabase();
    await db.$connect();
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it("uses the migrated schema with required tables, indexes, and foreign keys", async () => {
    const versions = await db.$queryRaw<Array<{ version: string }>>`SELECT VERSION() AS version`;
    const version = versions[0]?.version ?? "";
    expect(version).toBeTruthy();
    expect(() => assertCompatibleDatabaseVersion(version)).not.toThrow();

    const appliedMigrations = await db.$queryRaw<Array<{ applied: bigint }>>`
      SELECT COUNT(*) AS applied
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    expect(Number(appliedMigrations[0]?.applied ?? 0)).toBeGreaterThanOrEqual(2);

    const tables = await db.$queryRaw<Array<{ tableName: string }>>`
      SELECT TABLE_NAME AS tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `;
    const tableNames = new Set(tables.map((row) => row.tableName));
    for (const table of [
      "admin_users",
      "auth_sessions",
      "products",
      "categories",
      "product_categories",
      "inventory_balances",
      "inventory_movements",
      "audit_events",
    ]) {
      expect(tableNames.has(table), `missing migrated table ${table}`).toBe(true);
    }

    const inventoryUniqueIndex = await db.$queryRaw<Array<{ found: bigint }>>`
      SELECT COUNT(*) AS found
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'inventory_movements'
        AND COLUMN_NAME = 'requestKey'
        AND NON_UNIQUE = 0
    `;
    expect(Number(inventoryUniqueIndex[0]?.found ?? 0)).toBeGreaterThan(0);

    const productCategoryForeignKeys = await db.$queryRaw<Array<{ found: bigint }>>`
      SELECT COUNT(*) AS found
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'product_categories'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `;
    expect(Number(productCategoryForeignKeys[0]?.found ?? 0)).toBe(2);

    const inventoryChecks = await db.$queryRaw<Array<{ found: bigint }>>`
      SELECT COUNT(*) AS found
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'inventory_balances'
        AND CONSTRAINT_TYPE = 'CHECK'
    `;
    expect(Number(inventoryChecks[0]?.found ?? 0)).toBeGreaterThan(0);
    await expect(
      db.productCategory.create({
        data: { productId: randomUUID(), categoryId: randomUUID() },
      }),
    ).rejects.toBeTruthy();
  });

  it("exercises role permissions, session rows, catalog relations, and minor-unit prices with rollback", async () => {
    const roleCode = `P2TEST_${randomUUID().slice(0, 8)}`;
    const email = `phase2-${randomUUID()}@example.invalid`;
    const slug = `phase2-${randomUUID()}`;
    const marker = new Error("ROLL BACK DATABASE INTEGRATION FIXTURE");

    await expect(
      db.$transaction(async (tx) => {
        await tx.adminRole.create({ data: { code: roleCode, nameAr: "اختبار تكامل" } });
        await tx.adminRolePermission.create({ data: { roleCode, permission: "PRODUCTS_READ" } });
        const actor = await tx.adminUser.create({
          data: { name: "Integration Test", email, roleCode },
        });
        const sessionToken = randomUUID();
        await tx.authSession.create({
          data: {
            id: randomUUID(),
            token: sessionToken,
            userId: actor.id,
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        const session = await tx.authSession.findUnique({ where: { token: sessionToken } });
        expect(session?.userId).toBe(actor.id);

        const category = await tx.category.create({
          data: { slug, nameAr: "فئة اختبار", visible: true, reviewRequired: false },
        });
        const product = await tx.product.create({
          data: {
            slug,
            titleAr: "قطعة اختبار",
            descriptionAr: "سجل اصطناعي لاختبار تكامل قاعدة البيانات",
            type: "READY_MADE",
            status: "DRAFT",
            priceMinor: 12345,
            detailsReviewedAt: new Date(),
          },
        });
        await tx.productCategory.create({
          data: { productId: product.id, categoryId: category.id },
        });
        const media = await tx.mediaAsset.create({
          data: {
            provider: "LEGACY_LOCAL",
            originalKey: `integration/${randomUUID()}.jpg`,
            mimeType: "image/jpeg",
            byteSize: 1,
          },
        });
        await tx.productMedia.create({
          data: { productId: product.id, mediaId: media.id, position: 0 },
        });
        const variant = await tx.productVariant.create({
          data: { productId: product.id, nameAr: "اختبار", position: 0 },
        });
        const balance = await tx.inventoryBalance.create({
          data: { productId: product.id, variantId: variant.id, quantity: 4 },
        });
        await tx.inventoryMovement.create({
          data: {
            balanceId: balance.id,
            kind: "OPENING",
            delta: 4,
            balanceAfter: 4,
            reason: "Integration fixture",
            actorId: actor.id,
            actorLabel: actor.name,
          },
        });
        await tx.manufacturingPolicy.create({ data: { productId: product.id, available: true } });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            actorLabel: actor.name,
            action: "integration.fixture",
            entity: "Product",
            entityId: product.id,
          },
        });

        const saved = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: { categories: true, media: true, variants: { include: { inventory: true } } },
        });
        expect(saved.priceMinor).toBe(12345);
        expect(Number.isInteger(saved.priceMinor)).toBe(true);
        expect(saved.categories).toHaveLength(1);
        expect(saved.media).toHaveLength(1);
        expect(saved.variants[0]?.inventory?.quantity).toBe(4);

        throw marker;
      }),
    ).rejects.toThrow(marker.message);

    expect(await db.product.count({ where: { slug } })).toBe(0);
    expect(await db.adminRole.count({ where: { code: roleCode } })).toBe(0);

    const seededRoles = await db.adminRole.findMany({
      where: { code: { in: ["OWNER", "MANAGER", "CATALOG_EDITOR", "INVENTORY_STAFF"] } },
      include: { permissions: true },
    });
    const permissionsByRole = new Map(
      seededRoles.map((role) => [
        role.code,
        new Set(role.permissions.map((item) => item.permission)),
      ]),
    );
    expect(permissionsByRole.get("OWNER")?.has("STAFF_MANAGE")).toBe(true);
    expect(permissionsByRole.get("CATALOG_EDITOR")?.has("PRODUCTS_PUBLISH")).toBe(false);
    expect(permissionsByRole.get("INVENTORY_STAFF")?.has("PRODUCTS_WRITE")).toBe(false);
  });

  it("authenticates a synthetic admin and persists a Better Auth session", async () => {
    const email = `phase2-auth-${randomUUID()}@example.invalid`;
    const password = `P2-${randomUUID()}-Auth!`;
    let userId: string | undefined;
    let sessionToken: string | undefined;

    try {
      const user = await db.adminUser.create({
        data: {
          name: "Synthetic Auth Test",
          email,
          roleCode: "INVENTORY_STAFF",
          forcePasswordChange: true,
          emailVerified: true,
        },
      });
      userId = user.id;
      await db.authAccount.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: await hashPassword(password),
        },
      });

      const origin =
        process.env.AUTH_TRUSTED_ORIGINS?.split(",")[0]?.trim() || process.env.BETTER_AUTH_URL;
      if (!origin)
        throw new Error("Set the staging auth URL and trusted origin before integration tests.");
      const result = await getAuth().api.signInEmail({
        body: { email, password, rememberMe: false },
        headers: new Headers({ origin }),
      });
      sessionToken = result.token;

      expect(result.user.id).toBe(user.id);
      expect(result.user.email).toBe(email);
      expect(sessionToken).toBeTruthy();
      expect(await db.authSession.findUnique({ where: { token: sessionToken } })).toMatchObject({
        userId: user.id,
      });
      expect(
        (await db.adminUser.findUniqueOrThrow({ where: { id: user.id } })).forcePasswordChange,
      ).toBe(true);
    } finally {
      if (sessionToken) await db.authSession.deleteMany({ where: { token: sessionToken } });
      if (userId) {
        await db.authAccount.deleteMany({ where: { userId } });
        await db.adminUser.deleteMany({ where: { id: userId } });
      }
    }
  });

  it("applies a synthetic catalog mapping once and preserves edits on importer rerun", async () => {
    const suffix = randomUUID();
    const sourceProductId = `phase2-rerun-${suffix}`;
    const slug = `phase2-rerun-${suffix}`;
    const categorySlug = `phase2-rerun-category-${suffix}`;
    const imagePath = `integration/${suffix}.jpg`;
    const categoryUrl = `https://legacy.invalid/collections/${categorySlug}/`;
    let productId: string | undefined;

    const sourceProduct: LegacyProduct = {
      id: sourceProductId,
      url: `https://legacy.invalid/products/${slug}/`,
      name_ar: "منتج اصطناعي لاختبار إعادة الاستيراد",
      description: "Synthetic database-only importer acceptance fixture.",
      category_urls: [categoryUrl],
      price: "unverified source evidence",
      currency: "EGP",
      images: [{ local_path: imagePath, status: "downloaded" }],
    };

    try {
      const category = await db.category.create({
        data: {
          slug: categorySlug,
          nameAr: "فئة اختبار اصطناعية",
          visible: false,
          reviewRequired: true,
        },
      });
      const media = await db.mediaAsset.create({
        data: {
          provider: "LEGACY_LOCAL",
          originalKey: imagePath,
          mimeType: "image/jpeg",
          byteSize: 1,
        },
      });
      const draft = buildLegacyProductDraft(
        sourceProduct,
        new Map([[categoryUrl, category.id]]),
        new Map([[imagePath, media.id]]),
      );

      await expect(createLegacyProductIfUnmapped(db, sourceProduct, draft)).resolves.toBe(
        "imported",
      );
      const mapping = await db.legacyProductMapping.findUniqueOrThrow({
        where: { sourceProductId },
        select: { productId: true },
      });
      productId = mapping.productId;

      await db.product.update({
        where: { id: productId },
        data: { titleAr: "تعديل يدوي محفوظ", priceMinor: 12345, detailsReviewedAt: new Date() },
      });
      await expect(createLegacyProductIfUnmapped(db, sourceProduct, draft)).resolves.toBe(
        "skipped",
      );

      const preserved = await db.product.findUniqueOrThrow({
        where: { id: productId },
        include: { categories: true, media: true },
      });
      expect(preserved).toMatchObject({ titleAr: "تعديل يدوي محفوظ", priceMinor: 12345 });
      expect(preserved.detailsReviewedAt).toBeInstanceOf(Date);
      expect(preserved.categories).toHaveLength(1);
      expect(preserved.media).toHaveLength(1);
    } finally {
      await db.legacyProductMapping.deleteMany({ where: { sourceProductId } });
      if (productId) await db.product.deleteMany({ where: { id: productId } });
      await db.category.deleteMany({ where: { slug: categorySlug } });
      await db.mediaAsset.deleteMany({ where: { originalKey: imagePath } });
    }
  });

  it("serializes concurrent stock adjustments and rejects negative balances and duplicate request keys", async () => {
    const roleCode = `P2TEST_${randomUUID().slice(0, 8)}`;
    let actorId: string | undefined;
    let productId: string | undefined;

    try {
      await db.adminRole.create({ data: { code: roleCode, nameAr: "اختبار تكامل" } });
      const actor = await db.adminUser.create({
        data: {
          name: "Integration Test",
          email: `phase2-${randomUUID()}@example.invalid`,
          roleCode,
        },
      });
      actorId = actor.id;
      const token = randomUUID();
      await db.authSession.create({
        data: {
          id: randomUUID(),
          token,
          userId: actor.id,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      expect((await db.authSession.findUnique({ where: { token } }))?.userId).toBe(actor.id);
      const product = await db.product.create({
        data: {
          slug: `phase2-${randomUUID()}`,
          titleAr: "منتج اختبار مخزون",
          descriptionAr: "سجل اصطناعي لاختبار المخزون",
          type: "READY_MADE",
        },
      });
      productId = product.id;
      const variant = await db.productVariant.create({
        data: { productId: product.id, nameAr: "اختبار", position: 0 },
      });
      const balance = await db.inventoryBalance.create({
        data: { productId: product.id, variantId: variant.id, quantity: 4 },
      });
      const invalidVariant = await db.productVariant.create({
        data: { productId: product.id, nameAr: "رصيد سلبي مرفوض", position: 1 },
      });
      await expect(
        db.inventoryBalance.create({
          data: { productId: product.id, variantId: invalidVariant.id, quantity: -1 },
        }),
      ).rejects.toBeTruthy();

      const attempts = [
        { delta: 1, requestKey: randomUUID() },
        { delta: 2, requestKey: randomUUID() },
      ];
      const results = await Promise.all(
        attempts.map(({ delta, requestKey }) =>
          db.$transaction(async (tx) => {
            const changed = await tx.$executeRaw`
              UPDATE inventory_balances
              SET quantity = quantity + ${delta}, version = version + 1, updatedAt = CURRENT_TIMESTAMP(3)
              WHERE id = ${balance.id} AND version = 0 AND quantity + ${delta} >= 0
            `;
            if (changed !== 1) return 0;
            const updated = await tx.inventoryBalance.findUniqueOrThrow({
              where: { id: balance.id },
            });
            await tx.inventoryMovement.create({
              data: {
                balanceId: balance.id,
                kind: "ADJUSTMENT",
                delta,
                balanceAfter: updated.quantity,
                reason: "Concurrent integration adjustment",
                requestKey,
                actorId: actor.id,
                actorLabel: actor.name,
              },
            });
            await tx.auditEvent.create({
              data: {
                actorId: actor.id,
                actorLabel: actor.name,
                action: "inventory.adjusted",
                entity: "InventoryBalance",
                entityId: balance.id,
              },
            });
            return 1;
          }),
        ),
      );

      expect([...results].sort()).toEqual([0, 1]);
      const afterConcurrent = await db.inventoryBalance.findUniqueOrThrow({
        where: { id: balance.id },
      });
      expect(afterConcurrent.version).toBe(1);
      expect(afterConcurrent.quantity).toBeGreaterThanOrEqual(5);
      expect(afterConcurrent.quantity).toBeLessThanOrEqual(6);
      const winner = attempts.find((_, index) => results[index] === 1);
      expect(winner).toBeTruthy();

      const safeDecrease = await db.$transaction(async (tx) => {
        const changed = await tx.$executeRaw`
          UPDATE inventory_balances
          SET quantity = quantity - 1, version = version + 1, updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${balance.id} AND version = ${afterConcurrent.version} AND quantity - 1 >= 0
        `;
        if (changed !== 1) return 0;
        const updated = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
        await tx.inventoryMovement.create({
          data: {
            balanceId: balance.id,
            kind: "ADJUSTMENT",
            delta: -1,
            balanceAfter: updated.quantity,
            reason: "Safe integration decrease",
            requestKey: randomUUID(),
            actorId: actor.id,
            actorLabel: actor.name,
          },
        });
        return 1;
      });
      expect(safeDecrease).toBe(1);

      const beforeRejectedDecrease = await db.inventoryBalance.findUniqueOrThrow({
        where: { id: balance.id },
      });
      const rejectedDecrease = await db.$transaction(
        (tx) => tx.$executeRaw`
        UPDATE inventory_balances
        SET quantity = quantity - ${beforeRejectedDecrease.quantity + 1}, version = version + 1
        WHERE id = ${balance.id}
          AND version = ${beforeRejectedDecrease.version}
          AND quantity - ${beforeRejectedDecrease.quantity + 1} >= 0
      `,
      );
      expect(rejectedDecrease).toBe(0);
      expect(
        (await db.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } })).quantity,
      ).toBe(beforeRejectedDecrease.quantity);

      const winnerRequest = winner?.requestKey;
      expect(winnerRequest).toBeTruthy();
      const existingMovement = await db.inventoryMovement.findUnique({
        where: { requestKey: winnerRequest },
      });
      expect(existingMovement).not.toBeNull();
      await expect(
        db.inventoryMovement.create({
          data: {
            balanceId: balance.id,
            kind: "ADJUSTMENT",
            delta: 1,
            balanceAfter: beforeRejectedDecrease.quantity + 1,
            reason: "Duplicate request key must be rejected",
            requestKey: winnerRequest,
            actorId: actor.id,
            actorLabel: actor.name,
          },
        }),
      ).rejects.toBeTruthy();
      expect(
        await db.auditEvent.count({
          where: { action: "inventory.adjusted", entityId: balance.id },
        }),
      ).toBe(1);
    } finally {
      if (productId) await db.product.deleteMany({ where: { id: productId } });
      if (actorId) await db.adminUser.deleteMany({ where: { id: actorId } });
      await db.adminRole.deleteMany({ where: { code: roleCode } });
    }
  });
});
