import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import sharp from "sharp";
import { chromium } from "playwright";
import { GET as getPrivateDisplay } from "@/app/api/staging-media/[...key]/route";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
import { DELETE as deleteMedia } from "@/app/api/admin/media/[id]/route";
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
      url.pathname !==
        (process.env.P4_WORKSTREAM === "1"
          ? process.env.P5_WORKSTREAM === "1"
            ? "/sprtaya_phase5_disposable_test"
            : "/sprtaya_phase4_disposable_test"
          : process.env.P35_WORKSTREAM === "1"
            ? "/sprtaya_phase35_disposable_test"
            : "/sprtaya_phase3_disposable_test")
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

  it("rejects invalid prices and prevents a zero override from bypassing publication", async () => {
    const data = form({
      productId,
      titleAr: "قطعة اصطناعية للاختبار فقط",
      slug,
      descriptionAr: "بيانات اختبار محلية فقط",
      type: "READY_MADE",
      price: "١٬٢٣٤٫٥٦",
      detailsReviewed: "on",
      variantsJson: JSON.stringify([{ id: variantId, nameAr: "متغير اختبار", price: "0" }]),
    });
    data.append("categoryIds", categoryId);
    data.append("mediaIds", mediaId);
    const db = getDatabase();
    for (const price of ["-1", "1.234"]) {
      data.set("price", price);
      await redirected(saveProduct(data), `/admin/products/${productId}?error=invalid`);
    }
    data.set("price", "١٬٢٣٤٫٥٦");
    await redirected(saveProduct(data), `/admin/products/${productId}?saved=1`);
    await redirected(publishProduct(productId, true), `/admin/products/${productId}?error=publish`);
    expect(await db.product.findUnique({ where: { id: productId }, select: { status: true } })).toEqual({ status: "DRAFT" });
    data.set("variantsJson", JSON.stringify([{ id: variantId, nameAr: "متغير اختبار" }]));
    await redirected(saveProduct(data), `/admin/products/${productId}?saved=1`);
    expect(await db.productVariant.findUnique({ where: { id: variantId }, select: { priceMinor: true } })).toEqual({ priceMinor: null });
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
      ![
        "http://127.0.0.1:39010",
        "http://127.0.0.1:39110",
        "http://127.0.0.1:39210",
        ...(process.env.P5_WORKSTREAM === "1" ? ["http://127.0.0.1:39410"] : []),
      ].includes(process.env.MEDIA_S3_ENDPOINT || "") ||
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
      // Model the observed Chromium failure after a real committed PUT.
      // The client-side error cannot establish whether an object was written.
      const uploadWithBlockedResponse = async () => {
        const upload = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: signed.signedHeaders,
          body: new Uint8Array(image),
        });
        expect(upload.status).toBe(200);
        throw new TypeError("Browser blocked access to the upload response");
      };
      await expect(uploadWithBlockedResponse()).rejects.toThrow(TypeError);
      const uploaded = await storage.client.send(
        new HeadObjectCommand({ Bucket: storage.originalsBucket, Key: signed.key }),
      );
      expect(uploaded.ContentLength).toBe(image.length);
      expect(await getDatabase().mediaAsset.count({ where: { originalKey: signed.key } })).toBe(0);
      expect(
        (await fetch(process.env.MEDIA_S3_ENDPOINT + "/" + storage.originalsBucket + "/" + key))
          .status,
      ).toBe(403);
      expect(
        (
          await fetch(
            process.env.MEDIA_S3_ENDPOINT + "/" + storage.originalsBucket + "/anonymous.jpg",
            {
              method: "PUT",
              body: "denied",
            },
          )
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

  it("finalizes the same S3 upload concurrently without deleting the committed display", async () => {
    asUser(ownerCookie);
    const storage = getMediaStorage();
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#906040" },
    })
      .jpeg()
      .toBuffer();
    const req = (data: unknown) =>
      new Request(process.env.BETTER_AUTH_URL! + "/api/admin/media/finalize", {
        method: "POST",
        headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    const signed = await (
      await signUpload(req({ contentType: "image/jpeg", size: image.length }))
    ).json();
    try {
      expect(
        (
          await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: signed.signedHeaders,
            body: new Uint8Array(image),
          })
        ).status,
      ).toBe(200);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          finalizeUpload(req({ key: signed.key, size: image.length })),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      const assets = await getDatabase().mediaAsset.findMany({
        where: { originalKey: signed.key },
      });
      expect(assets).toHaveLength(1);
      expect((await fetch(assets[0].publicUrl!)).status).toBe(200);
    } finally {
      const asset = await getDatabase().mediaAsset.findUnique({
        where: { originalKey: signed.key },
      });
      await getDatabase().mediaAsset.deleteMany({ where: { originalKey: signed.key } });
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: signed.key }),
      );
      if (asset?.displayKey)
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.displayBucket, Key: asset.displayKey }),
        );
      storage.client.destroy();
    }
  });

  it("does not permit a reused presigned URL to overwrite an uploaded original", async () => {
    asUser(ownerCookie);
    const storage = getMediaStorage();
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#996040" },
    })
      .jpeg()
      .toBuffer();
    const req = new Request(process.env.BETTER_AUTH_URL! + "/api/admin/media/upload-url", {
      method: "POST",
      headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", size: image.length }),
    });
    const signed = await (await signUpload(req)).json();
    try {
      expect(
        (
          await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: signed.signedHeaders,
            body: new Uint8Array(image),
          })
        ).status,
      ).toBe(200);
      expect([409, 412]).toContain(
        (
          await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: signed.signedHeaders,
            body: new Uint8Array(image),
          })
        ).status,
      );
    } finally {
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: signed.key }),
      );
      storage.client.destroy();
    }
  });

  it("bounds chunked media JSON and rejects oversized declarations and invalid MIME types", async () => {
    asUser(ownerCookie);
    const request = (data: unknown) =>
      new Request(process.env.BETTER_AUTH_URL! + "/api/admin/media/upload-url", {
        method: "POST",
        headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    for (const body of [
      { contentType: "image/svg+xml", size: 10 },
      { contentType: "image/jpeg", size: 10 * 1024 * 1024 + 1 },
    ])
      expect((await signUpload(request(body))).status).toBe(400);
    const requestChunked = () =>
      new Request(process.env.BETTER_AUTH_URL! + "/api/admin/media/upload-url", {
        method: "POST",
        headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("ن".repeat(1100)));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit);
    expect((await signUpload(requestChunked())).status).toBe(413);
    expect((await finalizeUpload(requestChunked())).status).toBe(413);
  });

  it("recovers exact saved upload objects and rejects missing or interrupted originals", async () => {
    asUser(ownerCookie);
    const storage = getMediaStorage();
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#806040" },
    })
      .jpeg()
      .toBuffer();
    const req = (data: unknown) =>
      new Request(process.env.BETTER_AUTH_URL! + "/api/admin/media/finalize", {
        method: "POST",
        headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    const signed = await (
      await signUpload(req({ contentType: "image/jpeg", size: image.length }))
    ).json();
    let displayKey: string | undefined;
    try {
      expect((await finalizeUpload(req({ key: signed.key, size: image.length }))).status).toBe(503);
      expect(
        (
          await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: signed.signedHeaders,
            body: new Uint8Array(image),
          })
        ).status,
      ).toBe(200);
      const finalized = await finalizeUpload(req({ key: signed.key, size: image.length }));
      expect(finalized.status).toBe(200);
      const asset = await finalized.json();
      const row = await getDatabase().mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
      displayKey = row.displayKey!;
      const display = Buffer.from(await (await fetch(asset.url)).arrayBuffer());
      const file = path.join(
        process.env.P3_STATE_DIR!,
        "media-recovery-fixtures",
        randomUUID() + ".json",
      );
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(
        file,
        JSON.stringify({
          original: image.toString("base64"),
          display: display.toString("base64"),
          owner: row.uploadedById,
        }),
        { mode: 0o600 },
      );
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: signed.key }),
      );
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.displayBucket, Key: displayKey }),
      );
      expect((await fetch(asset.url)).status).toBe(404);
      expect((await finalizeUpload(req({ key: signed.key, size: image.length }))).status).toBe(503);
      const saved = JSON.parse(await readFile(file, "utf8"));
      await storage.client.send(
        new PutObjectCommand({
          Bucket: storage.originalsBucket,
          Key: signed.key,
          Body: Buffer.from(saved.original, "base64"),
          ContentType: "image/jpeg",
          Metadata: { owner: saved.owner },
          IfNoneMatch: "*",
        }),
      );
      await storage.client.send(
        new PutObjectCommand({
          Bucket: storage.displayBucket,
          Key: displayKey,
          Body: Buffer.from(saved.display, "base64"),
          ContentType: "image/webp",
          IfNoneMatch: "*",
        }),
      );
      const restored = Buffer.from(await (await fetch(asset.url)).arrayBuffer());
      expect(createHash("sha256").update(restored).digest("hex")).toBe(
        createHash("sha256").update(display).digest("hex"),
      );
      expect(
        (
          await fetch(
            storage.client.config.endpoint
              ? process.env.MEDIA_S3_ENDPOINT + "/" + storage.originalsBucket + "/" + signed.key
              : "invalid",
          )
        ).status,
      ).toBe(403);
    } finally {
      await getDatabase().mediaAsset.deleteMany({ where: { originalKey: signed.key } });
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: signed.key }),
      );
      if (displayKey)
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.displayBucket, Key: displayKey }),
        );
      storage.client.destroy();
    }
  });

  it("replaces product media without overwriting or deleting the previous upload", async () => {
    asUser(ownerCookie);
    const storage = getMediaStorage();
    const assets: { id: string; key: string; display: string }[] = [];
    let replacementId: string | undefined;
    const req = (data: unknown) =>
      new Request(process.env.BETTER_AUTH_URL! + "/api/admin/media/finalize", {
        method: "POST",
        headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json" },
        body: JSON.stringify(data),
      });
    try {
      for (const color of ["#906030", "#604020"]) {
        const image = await sharp({
          create: { width: 16, height: 16, channels: 3, background: color },
        })
          .jpeg()
          .toBuffer();
        const signed = await (
          await signUpload(req({ contentType: "image/jpeg", size: image.length }))
        ).json();
        expect(
          (
            await fetch(signed.uploadUrl, {
              method: "PUT",
              headers: signed.signedHeaders,
              body: new Uint8Array(image),
            })
          ).status,
        ).toBe(200);
        const result = await finalizeUpload(req({ key: signed.key, size: image.length }));
        expect(result.status).toBe(200);
        const asset = await result.json();
        const row = await getDatabase().mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
        assets.push({ id: row.id, key: row.originalKey, display: row.displayKey! });
      }
      const draft = await getDatabase().product.create({
        data: {
          slug: "replacement-" + randomUUID(),
          titleAr: "اختبار استبدال صورة",
          descriptionAr: "اختبار محلي فقط",
          type: "MADE_TO_ORDER",
          media: { create: { mediaId: assets[0].id, position: 0 } },
          variants: { create: { nameAr: "اختبار" } },
        },
        include: { variants: true },
      });
      replacementId = draft.id;
      const data = form({
        productId: draft.id,
        titleAr: draft.titleAr,
        descriptionAr: draft.descriptionAr,
        slug: draft.slug,
        type: "MADE_TO_ORDER",
        categoryIds: categoryId,
        mediaIds: assets[1].id,
        variantsJson: JSON.stringify([{ id: draft.variants[0].id, nameAr: "اختبار" }]),
      });
      await redirected(saveProduct(data), "/admin/products/" + draft.id + "?saved=1");
      const relations = await getDatabase().productMedia.findMany({
        where: { productId: draft.id },
      });
      expect(relations.map((r) => r.mediaId)).toEqual([assets[1].id]);
      expect(
        await getDatabase().mediaAsset.count({ where: { id: { in: assets.map((a) => a.id) } } }),
      ).toBe(2);
      for (const asset of assets)
        expect((await fetch(storage.publicBase + "/" + asset.display)).status).toBe(200);
      const remove = (id: string) => deleteMedia(new Request(
        process.env.BETTER_AUTH_URL! + "/api/admin/media/" + id,
        { method: "DELETE", headers: { origin: process.env.BETTER_AUTH_URL! } },
      ), { params: Promise.resolve({ id }) });
      asUser("");
      expect((await remove(assets[0].id)).status).toBe(403);
      asUser(ownerCookie);
      expect((await remove(assets[1].id)).status).toBe(409);
      const send = S3Client.prototype.send;
      const outage = vi.spyOn(S3Client.prototype, "send").mockImplementation(function (
        this: S3Client,
        ...args: Parameters<typeof send>
      ) {
        if (args[0] instanceof DeleteObjectCommand && args[0].input.Key === assets[0].key)
          throw new Error("Injected second object deletion failure");
        return Reflect.apply(send, this, args);
      });
      try {
        expect((await remove(assets[0].id)).status).toBe(503);
        expect(await getDatabase().mediaAsset.findUnique({ where: { id: assets[0].id } })).toBeNull();
        expect((await fetch(storage.publicBase + "/" + assets[0].display)).status).toBe(404);
      } finally {
        outage.mockRestore();
      }
      expect((await remove(assets[0].id)).status).toBe(204);
      expect((await remove(assets[0].id)).status).toBe(204);
      expect((await fetch(storage.publicBase + "/" + assets[0].display)).status).toBe(404);
      expect(await getDatabase().mediaAsset.findUnique({ where: { id: assets[0].id } })).toBeNull();
      expect(await getDatabase().auditEvent.count({ where: { entityId: assets[0].id, action: "media.cleanup-requested" } })).toBe(1);
      expect((await finalizeUpload(req({ key: assets[0].key, size: 1 }))).status).toBe(409);
    } finally {
      if (replacementId) await getDatabase().product.deleteMany({ where: { id: replacementId } });
      for (const asset of assets) {
        await getDatabase().mediaAsset.deleteMany({ where: { id: asset.id } });
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.originalsBucket, Key: asset.key }),
        );
        await storage.client.send(
          new DeleteObjectCommand({ Bucket: storage.displayBucket, Key: asset.display }),
        );
      }
      storage.client.destroy();
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

  it.skipIf(process.env.P8_REAL_R2 !== "1")("exercises the application routes and MariaDB against private real R2", async () => {
    const db = getDatabase();
    const endpoint = "https://b2c700ac4fb9325de8bb7dee4d0ed3a2.r2.cloudflarestorage.com";
    const origin = "https://bisque-pheasant-330767.hostingersite.com";
    const settings = {
      APP_ENV: "staging", STAGING_SITE: "1", STAGING_ACCESS_USERNAME: "local-pilot",
      STAGING_ACCESS_PASSWORD: "local-pilot-credential-only-synthetic",
      MEDIA_STAGING_UPLOADS: "1", STAGING_R2_ACCOUNT_ID: "b2c700ac4fb9325de8bb7dee4d0ed3a2",
      MEDIA_S3_ENDPOINT: endpoint, MEDIA_S3_REGION: "auto", MEDIA_S3_FORCE_PATH_STYLE: "true",
      MEDIA_S3_ORIGINALS_BUCKET: "sprtaya-staging-private", MEDIA_S3_DISPLAY_BUCKET: "sprtaya-staging-public",
      MEDIA_PUBLIC_BASE_URL: origin + "/api/staging-media",
      MEDIA_ACCESS_KEY_ID: process.env.P8_REAL_R2_ACCESS_KEY,
      MEDIA_SECRET_ACCESS_KEY: process.env.P8_REAL_R2_SECRET_KEY,
      AUTH_TRUSTED_ORIGINS: origin,
    };
    for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
    const basic = "Basic " + Buffer.from("local-pilot:local-pilot-credential-only-synthetic").toString("base64");
    const asR2User = (cookie: string) => { asUser(cookie); context.headers.set("authorization", basic); };
    const req = (path: string, body?: unknown, session = true, allowedOrigin = origin) => new Request(origin + path, {
      method: body === undefined ? "DELETE" : "POST",
      headers: { origin: allowedOrigin, ...(session ? { authorization: basic } : {}), "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const storage = getMediaStorage();
    let key: string | undefined, displayKey: string | undefined, assetId: string | undefined, draftId: string | undefined;
    const report: Record<string, unknown> = {};
    try {
      const png = await sharp({create:{width:24,height:16,channels:4,background:{r:112,g:151,b:80,alpha:0.5}}}).png().toBuffer();
      const input = { contentType: "image/png", size: png.length };
      asR2User("");
      expect((await signUpload(req("/api/admin/media/upload-url", input, false))).status).toBe(401);
      expect((await signUpload(req("/api/admin/media/upload-url", input))).status).toBe(403);
      asR2User(inventoryCookie);
      expect((await signUpload(req("/api/admin/media/upload-url", input))).status).toBe(403);
      asR2User(editorCookie);
      const staff = await signUpload(req("/api/admin/media/upload-url", input));
      expect(staff.status).toBe(200);
      const staffId = (await staff.json()).key.split("/")[1].split(".")[0];
      await db.auditEvent.update({where:{id:staffId},data:{createdAt:new Date(Date.now()-16*60*1000)}});
      expect((await finalizeUpload(req("/api/admin/media/finalize", {key:"product-originals/"+staffId+".png",size:png.length}))).status).toBe(410);
      asR2User(ownerCookie);
      expect((await signUpload(req("/api/admin/media/upload-url", input, true, "https://invalid.example"))).status).toBe(403);
      const signedResponse = await signUpload(req("/api/admin/media/upload-url", input));
      expect(signedResponse.status).toBe(200);
      const signed = await signedResponse.json();
      key = signed.key;
      expect(key).toMatch(/^product-originals\/[0-9a-f-]{36}\.png$/);
      expect(new URL(signed.uploadUrl).searchParams.get("X-Amz-Expires")).toBe("300");
      const ticketId = key!.split("/")[1].split(".")[0];
      expect((await db.auditEvent.findUniqueOrThrow({where:{id:ticketId}})).action).toBe("media.upload-authorized");
      const finish = () => finalizeUpload(req("/api/admin/media/finalize",{key,size:png.length,altAr:"صورة اختبار R2"}));
      expect((await finish()).status).toBe(503);
      const browser = await chromium.launch({channel:"chrome"});
      try {
        const page=await browser.newPage();
        await page.route(origin+"/",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Local route R2 test</title>"}));
        await page.goto(origin+"/");
        report.browserPut=await page.evaluate(async ({url,headers,bytes})=>(await fetch(url,{method:"PUT",headers,body:new Uint8Array(bytes),credentials:"omit"})).status,{url:signed.uploadUrl,headers:signed.signedHeaders,bytes:[...png]});
        expect(report.browserPut).toBe(200);
      } finally { await browser.close(); }
      asR2User(editorCookie);
      expect((await finish()).status).toBe(403);
      asR2User(ownerCookie);
      const send = S3Client.prototype.send;
      const outage = vi.spyOn(S3Client.prototype, "send").mockImplementation(function (
        this: S3Client,
        ...args: Parameters<typeof send>
      ) {
        if (args[0] instanceof PutObjectCommand && args[0].input.Bucket === storage.displayBucket)
          throw new Error("Injected derivative storage failure");
        return Reflect.apply(send, this, args);
      });
      try { expect((await finish()).status).toBe(503); } finally { outage.mockRestore(); }
      expect(await db.mediaAsset.count({where:{id:ticketId}})).toBe(0);
      const failCommit=vi.spyOn(db,"$transaction").mockRejectedValueOnce(new Error("Injected database commit failure"));
      try { expect((await finish()).status).toBe(503); } finally { failCommit.mockRestore(); }
      expect(await db.mediaAsset.count({where:{id:ticketId}})).toBe(0);
      const finalized=await finish();
      expect(finalized.status).toBe(200);
      const asset=await finalized.json();
      assetId=asset.id;
      expect(assetId).toBe(ticketId);
      const row=await db.mediaAsset.findUniqueOrThrow({where:{id:asset.id}});
      displayKey=row.displayKey!;
      expect(row.sha256).toBe(createHash("sha256").update(png).digest("hex"));
      expect(await (await finish()).json()).toMatchObject({id:assetId});
      const draft=await db.product.create({data:{slug:"r2-acceptance-"+randomUUID(),titleAr:"منتج اصطناعي",descriptionAr:"اختبار محلي"}});
      draftId=draft.id;
      const edit=form({productId:draft.id,titleAr:draft.titleAr,descriptionAr:draft.descriptionAr,slug:draft.slug,type:"MADE_TO_ORDER",mediaIds:asset.id,variantsJson:JSON.stringify([{nameAr:"متغير اصطناعي"}])});
      await redirected(saveProduct(edit),"/admin/products/"+draft.id+"?saved=1");
      expect(await db.productMedia.count({where:{productId:draft.id,mediaId:asset.id}})).toBe(1);
      const preview=(auth?:string)=>getPrivateDisplay(new Request(asset.url,{headers:auth?{authorization:auth}:{}}),{params:Promise.resolve({key:displayKey!.split("/")})});
      expect((await preview()).status).toBe(401);
      const response=await preview(basic);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe("webp");
      const remove=()=>deleteMedia(req("/api/admin/media/"+asset.id),{params:Promise.resolve({id:asset.id})});
      expect((await remove()).status).toBe(409);
      edit.delete("mediaIds");
      await redirected(saveProduct(edit),"/admin/products/"+draft.id+"?saved=1");
      expect((await remove()).status).toBe(204);
      for(const [Bucket,Key] of [[storage.originalsBucket,key],[storage.displayBucket,displayKey]])
        await expect(storage.client.send(new HeadObjectCommand({Bucket,Key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
      expect(await db.mediaAsset.count({where:{id:asset.id}})).toBe(0);
      expect(await db.productMedia.count({where:{productId:draft.id}})).toBe(0);
      await db.product.delete({where:{id:draft.id}});
      expect(await db.product.count({where:{id:draft.id}})).toBe(0);
      draftId=undefined;
      report.result={originalKey:key,displayKey,finalize:200,duplicate:200,preview:200,anonymousPreview:401,referencedDelete:409,cleanup:204,exactObjectHeads:[404,404],syntheticProductAndMediaRemoved:true,derivativeFailure:503,databaseFailure:503};
    } finally {
      if(draftId)await db.product.deleteMany({where:{id:draftId}});
      if(assetId)await db.mediaAsset.deleteMany({where:{id:assetId}});
      if(key){
        const uploadId=key.split("/")[1].split(".")[0];
        const receipts=await db.auditEvent.findMany({where:{entity:"MediaAsset",entityId:uploadId,action:"media.display-prepared"},select:{afterData:true}});
        const keys=new Set([displayKey,...receipts.map(r=>(r.afterData as {displayKey?:string}|null)?.displayKey)]);
        await storage.client.send(new DeleteObjectCommand({Bucket:storage.originalsBucket,Key:key}));
        for(const Key of keys)if(Key){
          await storage.client.send(new DeleteObjectCommand({Bucket:storage.displayBucket,Key}));
          await expect(storage.client.send(new HeadObjectCommand({Bucket:storage.displayBucket,Key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
        }
        await expect(storage.client.send(new HeadObjectCommand({Bucket:storage.originalsBucket,Key:key}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
        report.exactReconciliation={originalKey:key,preparedDerivativeKeys:[...keys].filter(Boolean),allAbsent:true};
      }
      if(process.env.P8_REAL_R2_EVIDENCE)
        await writeFile(process.env.P8_REAL_R2_EVIDENCE,JSON.stringify(report,null,2)+"\n",{mode:0o600});
      storage.client.destroy();vi.unstubAllEnvs();asUser(ownerCookie);
    }
  }, 90_000);

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
