import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import sharp from "sharp";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertSafeDatabaseTarget } from "../../../scripts/database-target";

// Only framework request context/cache/redirect are adapted. Authentication,
// permissions, actions, Prisma, transactions and MariaDB are the real code.
const context = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => context.headers }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error("REDIRECT:" + url);
  },
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { getDatabase } from "@/lib/server/database";
import { getAuth } from "@/lib/server/auth";
import { getAdminActor, requirePermission } from "@/lib/server/admin-session";
import { getStoreProductBySlug } from "@/lib/server/storefront-catalog";
import { getMediaStorage } from "@/lib/server/media-storage";
import { POST as signUpload } from "@/app/api/admin/media/upload-url/route";
import { POST as finalizeUpload } from "@/app/api/admin/media/finalize/route";
import {
  adjustInventory,
  archiveProduct,
  changeAdminPassword,
  createStaffAccount,
  deleteCategory,
  publishProduct,
  reorderProductMedia,
  saveBulkProductReview,
  saveCategory,
  saveManufacturingPolicy,
  saveProduct,
} from "./actions";

const enabled =
  process.env.PHASE2_DB_INTEGRATION === "1" && process.env.DATABASE_TARGET === "local";
const suffix = randomUUID();
const password = "Synthetic-" + randomUUID();
const userIds: string[] = [];
const products: string[] = [];
const categories: string[] = [];
let mediaId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let ownerCookie = "";
let editorCookie = "";
let inventoryCookie = "";
const slug = "local-acceptance-" + suffix;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
function asUser(cookie: string) {
  context.headers = new Headers({ cookie, origin: process.env.BETTER_AUTH_URL! });
}
async function redirected(run: Promise<unknown>, target: string) {
  await expect(run).rejects.toThrow("REDIRECT:" + target);
}
async function session(roleCode: string, forcePasswordChange = false) {
  const db = getDatabase();
  const user = await db.adminUser.create({
    data: {
      name: "Synthetic " + roleCode,
      email: `${roleCode}-${randomUUID()}@example.invalid`,
      roleCode,
      emailVerified: true,
      forcePasswordChange,
    },
  });
  userIds.push(user.id);
  await db.authAccount.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      userId: user.id,
      providerId: "credential",
      password: await hashPassword(password),
    },
  });
  const response = await getAuth().api.signInEmail({
    body: { email: user.email, password },
    headers: new Headers({ origin: process.env.BETTER_AUTH_URL! }),
    returnHeaders: true,
  });
  return {
    user,
    cookie: response.headers
      .getSetCookie()
      .map((value: string) => value.split(";")[0])
      .join("; "),
  };
}

describe.skipIf(!enabled)("Local MariaDB admin acceptance (real auth/actions/database)", () => {
  beforeAll(async () => {
    assertSafeDatabaseTarget();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "33078" ||
      url.pathname !== "/sprtaya_phase3_disposable_test"
    )
      throw new Error("Local acceptance is restricted to this workspace's test database.");
    ownerCookie = (await session("OWNER")).cookie;
    editorCookie = (await session("CATALOG_EDITOR")).cookie;
    inventoryCookie = (await session("INVENTORY_STAFF")).cookie;
    mediaId = (
      await getDatabase().mediaAsset.create({
        data: {
          provider: "LEGACY_LOCAL",
          originalKey: "local-acceptance/" + suffix + ".jpg",
          mimeType: "image/jpeg",
          byteSize: 1,
        },
      })
    ).id;
    asUser(ownerCookie);
  }, 30_000);

  afterAll(async () => {
    const db = getDatabase();
    if (products.length) {
      await db.inventoryMovement.deleteMany({
        where: { balance: { productId: { in: products } } },
      });
      await db.inventoryBalance.deleteMany({ where: { productId: { in: products } } });
      await db.product.deleteMany({ where: { id: { in: products } } });
    }
    await db.category.deleteMany({ where: { id: { in: categories } } });
    if (mediaId) await db.mediaAsset.deleteMany({ where: { id: mediaId } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await db.adminUser.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it("rejects anonymous writes and enforces real role authorization", async () => {
    asUser("");
    expect(await getAdminActor()).toBeNull();
    await expect(saveCategory(form({ nameAr: "غير مصرح" }))).rejects.toThrow("FORBIDDEN");
    asUser(inventoryCookie);
    expect((await getAdminActor())?.roleCode).toBe("INVENTORY_STAFF");
    await expect(requirePermission("INVENTORY_ADJUST")).resolves.toMatchObject({
      roleCode: "INVENTORY_STAFF",
    });
    await expect(saveProduct(new FormData())).rejects.toThrow("FORBIDDEN");
    asUser(editorCookie);
    await expect(publishProduct(randomUUID(), true)).rejects.toThrow("FORBIDDEN");
    asUser(ownerCookie);
  });

  it("immediately rejects a banned administrator's existing real session", async () => {
    const account = await session("MANAGER");
    asUser(account.cookie);
    await getDatabase().adminUser.update({
      where: { id: account.user.id },
      data: { banned: true },
    });
    try {
      expect(await getAdminActor()).toBeNull();
      await expect(requirePermission("PRODUCTS_WRITE")).rejects.toThrow("FORBIDDEN");
    } finally {
      asUser(ownerCookie);
    }
  });

  it("requires password rotation, verifies the old password, and revokes other sessions", async () => {
    const forced = await session("MANAGER", true);
    asUser(forced.cookie);
    await expect(requirePermission("PRODUCTS_WRITE")).rejects.toThrow("FORBIDDEN");
    const other = await getAuth().api.signInEmail({
      body: { email: forced.user.email, password },
      headers: context.headers,
    });
    const next = "Rotated-" + randomUUID();
    const data = form({ currentPassword: "incorrect", newPassword: next, confirmPassword: next });
    expect(await changeAdminPassword(data)).toBe("current");
    data.set("currentPassword", password);
    expect(await changeAdminPassword(data)).toBe("ok");
    expect(
      await getDatabase().authSession.findUnique({ where: { token: other.token } }),
    ).toBeNull();
    const account = await getDatabase().authAccount.findFirstOrThrow({
      where: { userId: forced.user.id },
    });
    expect(await verifyPassword({ hash: account.password!, password: next })).toBe(true);
    expect(await verifyPassword({ hash: account.password!, password })).toBe(false);
    expect((await getAdminActor())?.forcePasswordChange).toBe(false);
    await expect(requirePermission("PRODUCTS_WRITE")).resolves.toBeTruthy();
    asUser(ownerCookie);
  });

  it("creates and updates categories, rejects duplicate slugs and hierarchy cycles", async () => {
    const data = form({ nameAr: "فئة اختبار محلي", slug, visible: "on", reviewRequired: "on" });
    await redirected(saveCategory(data), "/admin/categories?saved=1");
    const category = await getDatabase().category.findUniqueOrThrow({ where: { slug } });
    categoryId = category.id;
    categories.push(category.id);
    expect(category).toMatchObject({ visible: true, reviewRequired: false });
    await redirected(saveCategory(data), "/admin/categories?error=slug");
    data.set("id", category.id);
    data.set("nameAr", "فئة اختبار معدلة");
    await redirected(saveCategory(data), "/admin/categories?saved=1");
    data.set("parentId", category.id);
    await redirected(saveCategory(data), "/admin/categories?error=hierarchy");
  });

  it("creates a real draft with Arabic minor-unit price and opening inventory", async () => {
    const data = form({
      titleAr: "قطعة اصطناعية للاختبار فقط",
      slug,
      descriptionAr: "بيانات اختبار محلية فقط",
      type: "READY_MADE",
      price: "١٬٢٣٤٫٥٦",
      detailsReviewed: "on",
      featured: "on",
      variantsJson: JSON.stringify([{ nameAr: "متغير اختبار", quantity: "4" }]),
    });
    data.append("categoryIds", categoryId);
    data.append("mediaIds", mediaId);
    await expect(saveProduct(data)).rejects.toThrow(/REDIRECT:\/admin\/products\/.+\?saved=1/);
    const product = await getDatabase().product.findUniqueOrThrow({
      where: { slug },
      include: { variants: { include: { inventory: true } } },
    });
    productId = product.id;
    products.push(product.id);
    variantId = product.variants[0].id;
    expect(product).toMatchObject({
      status: "DRAFT",
      priceMinor: 123456,
      availability: "AVAILABLE",
    });
    expect(product.variants[0].inventory?.quantity).toBe(4);
    expect(await getStoreProductBySlug(slug)).toBeUndefined();
  });

  it("bulk reviews and publishes into the database storefront without a rebuild", async () => {
    const data = form({
      intent: "publish",
      [`titleAr_${productId}`]: "قطعة اصطناعية بعد المراجعة",
      [`type_${productId}`]: "READY_MADE",
      [`price_${productId}`]: "٢٬٣٤٥٫٦٧",
      [`detailsReviewed_${productId}`]: "on",
    });
    data.append("productIds", productId);
    data.append("selectedIds", productId);
    await redirected(saveBulkProductReview(data), "/admin/products/review?saved=published");
    expect(await getStoreProductBySlug(slug)).toMatchObject({
      priceMinor: 234567,
      status: "PUBLISHED",
      purchasable: false,
    });
    data.set("intent", "save");
    data.set(`price_${productId}`, "");
    await redirected(saveBulkProductReview(data), "/admin/products/review?error=publish");
    expect(
      (await getDatabase().product.findUniqueOrThrow({ where: { id: productId } })).priceMinor,
    ).toBe(234567);
  });

  it("rolls back a mixed eligible/incomplete bulk publication atomically", async () => {
    const incomplete = await getDatabase().product.create({
      data: {
        titleAr: "منتج ناقص اصطناعي",
        descriptionAr: "اختبار محلي",
        slug: slug + "-incomplete",
      },
    });
    products.push(incomplete.id);
    const data = form({ intent: "publish" });
    for (const id of [productId, incomplete.id]) {
      data.append("productIds", id);
      data.append("selectedIds", id);
      data.set("titleAr_" + id, "تعديل يجب التراجع عنه");
      data.set("type_" + id, "READY_MADE");
      data.set("price_" + id, "999.00");
      data.set("detailsReviewed_" + id, "on");
    }
    await redirected(saveBulkProductReview(data), "/admin/products/review?error=publish");
    expect(
      (await getDatabase().product.findUniqueOrThrow({ where: { id: productId } })).priceMinor,
    ).toBe(234567);
    expect(
      (await getDatabase().product.findUniqueOrThrow({ where: { id: incomplete.id } })).priceMinor,
    ).toBeNull();
  });

  it("edits a published product transactionally and rejects incomplete edits without changing stock", async () => {
    const data = form({
      productId,
      titleAr: "منتج اختبار معدل",
      slug,
      descriptionAr: "تعديل اختباري",
      type: "READY_MADE",
      price: "2345.67",
      detailsReviewed: "on",
      variantsJson: JSON.stringify([
        {
          id: variantId,
          nameAr: "متغير معدل",
          quantity: "999",
          optionsText: "التشطيب=اختبار",
          widthMm: "100",
        },
      ]),
    });
    data.append("categoryIds", categoryId);
    await redirected(saveProduct(data), `/admin/products/${productId}?error=publish`);
    expect(
      (await getDatabase().product.findUniqueOrThrow({ where: { id: productId } })).titleAr,
    ).toBe("قطعة اصطناعية بعد المراجعة");
    data.append("mediaIds", mediaId);
    await redirected(saveProduct(data), `/admin/products/${productId}?saved=1`);
    const edited = await getDatabase().product.findUniqueOrThrow({
      where: { id: productId },
      include: { variants: { include: { inventory: true } } },
    });
    expect(edited).toMatchObject({
      titleAr: "منتج اختبار معدل",
      status: "PUBLISHED",
      priceMinor: 234567,
    });
    expect(edited.variants[0]).toMatchObject({
      nameAr: "متغير معدل",
      widthMm: 100,
      options: { التشطيب: "اختبار" },
    });
    expect(edited.variants[0].inventory?.quantity).toBe(4);
    asUser(editorCookie);
    await expect(
      reorderProductMedia(form({ productId, ["position_" + mediaId]: "0" })),
    ).rejects.toThrow("FORBIDDEN");
    asUser(ownerCookie);
  });

  it("replaces empty variants repeatedly without colliding with retired variant positions", async () => {
    const replacementSlug = slug + "-replace";
    for (const index of [0, 1, 2, 3]) {
      const data = form({
        ...(index ? { productId: products.at(-1)! } : {}),
        titleAr: "اختبار استبدال المتغير",
        slug: replacementSlug,
        type: "READY_MADE",
        variantsJson: JSON.stringify([{ nameAr: "متغير " + index, quantity: "0" }]),
      });
      data.append("categoryIds", categoryId);
      await expect(saveProduct(data)).rejects.toThrow(/REDIRECT:.+saved=1/);
      const saved = await getDatabase().product.findUniqueOrThrow({
        where: { slug: replacementSlug },
      });
      if (index === 0) products.push(saved.id);
    }
    const variants = await getDatabase().productVariant.findMany({
      where: { productId: products.at(-1)! },
    });
    expect(variants.filter((variant) => variant.active)).toHaveLength(1);
    expect(variants.filter((variant) => !variant.active)).toHaveLength(3);
    expect(new Set(variants.map((variant) => variant.position)).size).toBe(4);
  });

  it("allows only the owner to provision limited staff with mandatory password rotation", async () => {
    const email = `staff-${suffix}@example.invalid`;
    const data = form({ email, name: "موظف اختبار", password, roleCode: "INVENTORY_STAFF" });
    asUser(editorCookie);
    await expect(createStaffAccount(data)).rejects.toThrow("FORBIDDEN");
    asUser(ownerCookie);
    data.set("roleCode", "OWNER");
    await redirected(createStaffAccount(data), "/admin/staff?error=invalid");
    data.set("roleCode", "INVENTORY_STAFF");
    await expect(createStaffAccount(data)).rejects.toThrow("REDIRECT:/admin/staff?saved=");
    const staff = await getDatabase().adminUser.findUniqueOrThrow({ where: { email } });
    userIds.push(staff.id);
    expect(staff).toMatchObject({ roleCode: "INVENTORY_STAFF", forcePasswordChange: true });
    const credential = await getDatabase().authAccount.findFirstOrThrow({
      where: { userId: staff.id },
    });
    expect(credential.password).not.toBe(password);
    expect(await verifyPassword({ hash: credential.password!, password })).toBe(true);
    await redirected(createStaffAccount(data), "/admin/staff?error=exists");
  });

  it("persists inventory adjustments once, rejects negative stock and synchronizes availability", async () => {
    asUser(inventoryCookie);
    const key = randomUUID();
    const data = form({ variantId, delta: "-4", requestKey: key, reason: "تسوية اختبار محلي" });
    await redirected(adjustInventory(data), "/admin/inventory?saved=1");
    await redirected(adjustInventory(data), "/admin/inventory?saved=replay");
    data.set("requestKey", randomUUID());
    data.set("delta", "-1");
    await redirected(adjustInventory(data), "/admin/inventory?error=stock");
    const variant = await getDatabase().productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { inventory: true, product: true },
    });
    expect(variant.inventory?.quantity).toBe(0);
    expect(variant.availability).toBe("UNAVAILABLE");
    expect(variant.product.availability).toBe("UNAVAILABLE");
    expect(await getDatabase().inventoryMovement.count({ where: { requestKey: key } })).toBe(1);
    asUser(ownerCookie);
  });

  it("creates independent per-product manufacturing policies without overwriting the global policy", async () => {
    const db = getDatabase();
    const global = await db.manufacturingPolicy.findUniqueOrThrow({ where: { id: "global" } });
    for (const index of [1, 2]) {
      const product = await db.product.create({
        data: {
          slug: slug + "-made-" + index,
          titleAr: "اختبار تصنيع",
          descriptionAr: "اختبار محلي",
          type: "MADE_TO_ORDER",
          priceMinor: 10000,
        },
      });
      products.push(product.id);
      const data = form({
        productId: product.id,
        minDays: "7",
        maxDays: "14",
        depositMode: "FULL_ADVANCE",
        depositType: "PERCENT",
        depositValue: "100",
        balanceCollection: "BEFORE_DISPATCH",
        available: "on",
      });
      await redirected(saveManufacturingPolicy(data), `/admin/products/${product.id}?saved=1`);
      expect(
        await db.manufacturingPolicy.findUnique({ where: { productId: product.id } }),
      ).toMatchObject({ id: product.id, available: true });
    }
    expect(await db.manufacturingPolicy.findUnique({ where: { id: "global" } })).toEqual(global);
  });

  it("uses real S3 signed uploads, rejects altered ownership and non-images, and persists a derivative", async () => {
    const storage = getMediaStorage();
    if (
      process.env.MEDIA_S3_ENDPOINT !== "http://127.0.0.1:39010" ||
      new URL(storage.publicBase).hostname !== "127.0.0.1"
    )
      throw new Error("Media acceptance requires the isolated loopback S3 service.");
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#9c6239" },
    })
      .jpeg()
      .toBuffer();
    const request = (url: string, data: unknown, origin = process.env.BETTER_AUTH_URL!) =>
      new Request(origin + url, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    let assetId: string | undefined, key: string | undefined, displayKey: string | undefined;
    try {
      asUser("");
      expect((await signUpload(request("/api/admin/media/upload-url", {}))).status).toBe(403);
      asUser(ownerCookie);
      expect(
        (
          await signUpload(
            request(
              "/api/admin/media/upload-url",
              { contentType: "image/jpeg", size: image.length },
              "https://untrusted.invalid",
            ),
          )
        ).status,
      ).toBe(403);
      const signedResponse = await signUpload(
        request("/api/admin/media/upload-url", { contentType: "image/jpeg", size: image.length }),
      );
      expect(signedResponse.status).toBe(200);
      const signed = await signedResponse.json();
      key = signed.key;
      const upload = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: signed.signedHeaders,
        body: new Uint8Array(image),
      });
      expect(upload.status).toBe(200);
      expect(
        (await fetch("http://127.0.0.1:39010/" + storage.originalsBucket + "/" + key)).status,
      ).toBe(403);
      expect(
        (
          await fetch("http://127.0.0.1:39010/" + storage.originalsBucket + "/anonymous.jpg", {
            method: "PUT",
            body: "denied",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: { ...signed.signedHeaders, "x-amz-meta-owner": "altered-owner" },
            body: new Uint8Array(image),
          })
        ).status,
      ).toBe(403);
      asUser(editorCookie);
      expect(
        (await finalizeUpload(request("/api/admin/media/finalize", { key, size: image.length })))
          .status,
      ).toBe(403);
      asUser(ownerCookie);
      const finalized = await finalizeUpload(
        request("/api/admin/media/finalize", {
          key,
          size: image.length,
          altAr: "صورة تكامل اصطناعية",
        }),
      );
      expect(finalized.status).toBe(200);
      const asset = await finalized.json();
      assetId = asset.id;
      const persisted = await getDatabase().mediaAsset.findUniqueOrThrow({
        where: { id: assetId },
      });
      displayKey = persisted.displayKey!;
      expect(persisted).toMatchObject({ provider: "S3_COMPATIBLE", width: 32, height: 32 });
      const publicRead = await fetch(asset.url);
      expect(publicRead.status).toBe(200);
      expect(publicRead.headers.get("content-type")).toBe("image/webp");
      expect(
        (await finalizeUpload(request("/api/admin/media/finalize", { key, size: image.length })))
          .status,
      ).toBe(200);
      expect(await getDatabase().mediaAsset.count({ where: { originalKey: key } })).toBe(1);
      const badResponse = await signUpload(
        request("/api/admin/media/upload-url", { contentType: "image/jpeg", size: 8 }),
      );
      const bad = await badResponse.json();
      expect(
        (
          await fetch(bad.uploadUrl, {
            method: "PUT",
            headers: bad.signedHeaders,
            body: "notimage",
          })
        ).status,
      ).toBe(200);
      expect(
        (await finalizeUpload(request("/api/admin/media/finalize", { key: bad.key, size: 8 })))
          .status,
      ).toBe(400);
    } finally {
      if (assetId) await getDatabase().mediaAsset.deleteMany({ where: { id: assetId } });
      if (key)
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: key }),
        );
      if (displayKey)
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.displayBucket, Key: displayKey }),
        );
      storage.client.destroy();
      asUser(ownerCookie);
    }
  });

  it("unpublishes immediately, protects linked categories and archives products", async () => {
    await redirected(deleteCategory(categoryId), "/admin/categories?error=not-empty");
    await redirected(publishProduct(productId, false), `/admin/products/${productId}?saved=1`);
    expect(await getStoreProductBySlug(slug)).toBeUndefined();
    await redirected(archiveProduct(productId), "/admin/products?saved=archived");
    expect(
      (await getDatabase().product.findUniqueOrThrow({ where: { id: productId } })).status,
    ).toBe("ARCHIVED");
    await redirected(publishProduct(productId, true), `/admin/products/${productId}?error=publish`);
    const empty = await getDatabase().category.create({
      data: { slug: slug + "-empty", nameAr: "فئة فارغة" },
    });
    await redirected(deleteCategory(empty.id), "/admin/categories?saved=deleted");
    expect(await getDatabase().category.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it("rejects a database-expired session and a revoked session", async () => {
    asUser(ownerCookie);
    expect((await getAdminActor())?.roleCode).toBe("OWNER");
    await getDatabase().authSession.updateMany({
      where: { userId: userIds[0] },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect(await getAdminActor()).toBeNull();
    asUser(editorCookie);
    expect((await getAdminActor())?.roleCode).toBe("CATALOG_EDITOR");
    await getDatabase().authSession.deleteMany({ where: { userId: userIds[1] } });
    expect(await getAdminActor()).toBeNull();
    await expect(requirePermission("PRODUCTS_WRITE")).rejects.toThrow("FORBIDDEN");
  });

  it("rate-limits repeated failed logins using the database-backed limiter", async () => {
    const ip = "198.51.100." + (Math.floor(Math.random() * 200) + 1);
    const statuses: number[] = [];
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await getAuth().handler(
          new Request(process.env.BETTER_AUTH_URL + "/api/auth/sign-in/email", {
            method: "POST",
            headers: {
              origin: process.env.BETTER_AUTH_URL!,
              "content-type": "application/json",
              "x-forwarded-for": ip,
            },
            body: JSON.stringify({
              email: "nonexistent-" + suffix + "@example.invalid",
              password: "Incorrect-synthetic-password",
            }),
          }),
        );
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses[5]).toBe(429);
      expect(
        await getDatabase().authRateLimit.count({ where: { key: { contains: ip } } }),
      ).toBeGreaterThan(0);
    } finally {
      await getDatabase().authRateLimit.deleteMany({ where: { key: { contains: ip } } });
    }
  });
});
