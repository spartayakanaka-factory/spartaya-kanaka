"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { getAdminActor, requirePermission, type AdminActor } from "@/lib/server/admin-session";
import { getAuth } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { productPublicationBlockers } from "@/lib/admin/product-publication";
import { hasPermission } from "@/lib/admin/permissions";

const uuid = z.string().uuid();
const productSchema = z.object({
  productId: z.string().optional(),
  titleAr: z.string().trim().min(2, "اسم المنتج قصير جداً").max(191, "الاسم أطول من الحد المسموح"),
  titleEn: z.string().trim().max(191).optional(),
  descriptionAr: z.string().trim().max(10000).optional(),
  descriptionEn: z.string().trim().max(10000).optional(),
  slug: z.string().trim().min(2).max(191).regex(/^[\p{L}\p{N}-]+$/u, "استخدم أحرفاً أو أرقاماً أو شرطة في الرابط"),
  type: z.enum(["READY_MADE", "MADE_TO_ORDER"]),
  price: z.string().trim().optional(),
  categoryIds: z.array(z.string().min(1)).max(20),
  mediaIds: z.array(z.string().uuid()).max(30),
  featured: z.boolean(),
  detailsReviewed: z.boolean(),
  variantsJson: z.string().max(24_000),
});
const variantSchema = z.object({
  id: z.string().uuid().optional(),
  nameAr: z.string().trim().min(1).max(191),
  nameEn: z.string().trim().max(191).optional(),
  sku: z.string().trim().max(96).optional(),
  price: z.string().trim().optional(),
  optionsText: z.string().max(500).optional(),
  widthMm: z.string().optional(),
  heightMm: z.string().optional(),
  depthMm: z.string().optional(),
  weightGrams: z.string().optional(),
  quantity: z.string().optional(),
});

function minorUnits(raw: string | undefined) {
  if (!raw) return null;
  const value = raw.replace(/\s/g, "").replace(/,/g, "");
  if (!/^(?:\d{1,7})(?:\.\d{1,2})?$/.test(value)) throw new Error("INVALID_PRICE");
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("INVALID_PRICE");
  return minor;
}

function intField(raw: string | undefined, fallback = 0) {
  if (!raw) return fallback;
  if (!/^\d{1,8}$/.test(raw)) throw new Error("INVALID_QUANTITY");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error("INVALID_QUANTITY");
  return parsed;
}

function optionalDimension(raw: string | undefined, max: number) {
  if (!raw) return null;
  if (!/^\d{1,6}$/.test(raw)) throw new Error("INVALID_DIMENSION");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) throw new Error("INVALID_DIMENSION");
  return value;
}

function parseVariantOptions(raw: string | undefined) {
  const options: Record<string, string> = {};
  for (const item of (raw ?? "").split(/[;؛\n]/).map((part) => part.trim()).filter(Boolean)) {
    const separator = item.indexOf("=");
    if (separator < 1) throw new Error("INVALID_OPTIONS");
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!key || !value || key.length > 60 || value.length > 100 || options[key]) throw new Error("INVALID_OPTIONS");
    options[key] = value;
  }
  return Object.keys(options).length ? options : null;
}

async function audit(actor: AdminActor, action: string, entity: string, entityId: string, after: unknown, before?: unknown) {
  await getDatabase().auditEvent.create({
    data: {
      actorId: actor.id,
      actorLabel: actor.name,
      action,
      entity,
      entityId,
      beforeData: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
      afterData: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
    },
  });
}

function revalidateStorefront(slug?: string) {
  revalidatePath("/ar");
  revalidatePath("/en");
  revalidatePath("/ar/products");
  revalidatePath("/en/products");
  revalidatePath("/ar/collections");
  revalidatePath("/en/collections");
  revalidatePath("/sitemap.xml");
  if (slug) {
    revalidatePath("/ar/products/" + slug);
    revalidatePath("/en/products/" + slug);
  }
}

export async function saveProduct(formData: FormData): Promise<void> {
  const actor = await requirePermission("PRODUCTS_WRITE");
  const raw = {
    productId: String(formData.get("productId") ?? "") || undefined,
    titleAr: String(formData.get("titleAr") ?? ""),
    titleEn: String(formData.get("titleEn") ?? ""),
    descriptionAr: String(formData.get("descriptionAr") ?? ""),
    descriptionEn: String(formData.get("descriptionEn") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    type: String(formData.get("type") ?? ""),
    price: String(formData.get("price") ?? ""),
    categoryIds: formData.getAll("categoryIds").map(String),
    mediaIds: formData.getAll("mediaIds").map(String),
    featured: formData.get("featured") === "on",
    detailsReviewed: formData.get("detailsReviewed") === "on",
    variantsJson: String(formData.get("variantsJson") ?? "[]"),
  };
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) redirect("/admin/products/new?error=invalid");
  const input = parsed.data;
  const created = !input.productId;
  const db = getDatabase();
  let priceMinor: number | null;
  try { priceMinor = minorUnits(input.price); } catch { redirect(created ? "/admin/products/new?error=invalid" : "/admin/products/" + input.productId + "?error=invalid"); }
  let parsedVariants: z.infer<typeof variantSchema>[];
  try {
    const json = JSON.parse(input.variantsJson) as unknown;
    const result = z.array(variantSchema).min(1).max(20).safeParse(json);
    if (!result.success) throw new Error("INVALID_VARIANTS");
    parsedVariants = result.data;
  } catch { redirect(created ? "/admin/products/new?error=invalid" : "/admin/products/" + input.productId + "?error=invalid"); }
  const skuList = parsedVariants.map((variant) => variant.sku?.trim()).filter((sku): sku is string => Boolean(sku));
  if (new Set(skuList).size !== skuList.length) redirect(created ? "/admin/products/new?error=sku" : "/admin/products/" + input.productId + "?error=sku");
  let normalizedVariants: { id?: string; nameAr: string; nameEn: string | null; sku: string | null; priceMinor: number | null; options: Record<string, string> | null; widthMm: number | null; heightMm: number | null; depthMm: number | null; weightGrams: number | null; quantity: number | null }[];
  try {
    normalizedVariants = parsedVariants.map((variant) => ({
      id: variant.id,
      nameAr: variant.nameAr,
      nameEn: variant.nameEn || null,
      sku: variant.sku?.trim() || null,
      priceMinor: minorUnits(variant.price) ?? priceMinor,
      options: parseVariantOptions(variant.optionsText),
      widthMm: optionalDimension(variant.widthMm, 50_000),
      heightMm: optionalDimension(variant.heightMm, 50_000),
      depthMm: optionalDimension(variant.depthMm, 50_000),
      weightGrams: optionalDimension(variant.weightGrams, 500_000),
      quantity: variant.quantity?.trim() ? intField(variant.quantity) : null,
    }));
  } catch { redirect(created ? "/admin/products/new?error=invalid" : "/admin/products/" + input.productId + "?error=invalid"); }
  const existing = created
    ? null
    : await db.product.findUnique({ where: { id: input.productId }, include: { inventory: true, media: true, variants: { where: { active: true }, include: { inventory: true } } } });
  if (!created && (!existing || !uuid.safeParse(input.productId).success)) redirect("/admin/products?error=missing");
  if (existing?.status === "PUBLISHED") await requirePermission("PRODUCTS_PUBLISH");
  if (existing?.type === "READY_MADE" && input.type === "MADE_TO_ORDER" && existing.inventory.some((item) => item.quantity > 0)) {
    redirect("/admin/products/" + input.productId + "?error=stock");
  }
  const existingVariantIds = new Set(existing?.variants.map((variant) => variant.id) ?? []);
  if (normalizedVariants.some((variant) => variant.id && !existingVariantIds.has(variant.id))) redirect(created ? "/admin/products/new?error=invalid" : "/admin/products/" + input.productId + "?error=invalid");
  const submittedVariantIds = new Set(normalizedVariants.map((variant) => variant.id).filter((id): id is string => Boolean(id)));
  const removedVariants = existing?.variants.filter((variant) => !submittedVariantIds.has(variant.id)) ?? [];
  if (removedVariants.some((variant) => (variant.inventory?.quantity ?? 0) > 0)) redirect("/admin/products/" + input.productId + "?error=variant-stock");
  if (input.type === "READY_MADE" && normalizedVariants.some((variant) => {
    const oldVariant = variant.id ? existing?.variants.find((item) => item.id === variant.id) : undefined;
    return (!oldVariant || !oldVariant.inventory) && variant.quantity === null;
  })) redirect((created ? "/admin/products/new" : "/admin/products/" + input.productId) + "?error=inventory");
  if (skuList.length) {
    const conflicts = await db.productVariant.findMany({ where: { sku: { in: skuList }, ...(existingVariantIds.size ? { id: { notIn: [...existingVariantIds] } } : {}) }, select: { id: true } });
    if (conflicts.length) redirect(created ? "/admin/products/new?error=sku" : "/admin/products/" + input.productId + "?error=sku");
  }
  const slug = input.slug;
  const duplicateSlug = await db.product.findFirst({ where: { slug, ...(created ? {} : { id: { not: input.productId } }) }, select: { id: true } });
  if (duplicateSlug) redirect(created ? "/admin/products/new?error=slug" : "/admin/products/" + input.productId + "?error=slug");
  const categories = input.categoryIds.length
    ? await db.category.findMany({ where: { id: { in: input.categoryIds } }, select: { id: true } })
    : [];
  if (categories.length !== input.categoryIds.length) redirect("/admin/products/new?error=category");
  const media = input.mediaIds.length
    ? await db.mediaAsset.findMany({ where: { id: { in: input.mediaIds } }, select: { id: true } })
    : [];
  if (media.length !== input.mediaIds.length) redirect("/admin/products/new?error=media");
  const saved = await db.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { id: input.productId ?? "00000000-0000-0000-0000-000000000000" },
      create: {
        titleAr: input.titleAr,
        titleEn: input.titleEn || null,
        descriptionAr: input.descriptionAr || "",
        descriptionEn: input.descriptionEn || null,
        slug,
        type: input.type,
        priceMinor,
        detailsReviewedAt: input.detailsReviewed ? new Date() : null,
        featured: input.featured,
        availability: "UNAVAILABLE",
        categories: { create: categories.map(({ id }, position) => ({ categoryId: id, position })) },
        media: { create: input.mediaIds.map((mediaId, position) => ({ mediaId, position })) },
      },
      update: {
        titleAr: input.titleAr,
        titleEn: input.titleEn || null,
        descriptionAr: input.descriptionAr || "",
        descriptionEn: input.descriptionEn || null,
        slug,
        type: input.type,
        priceMinor,
        detailsReviewedAt: input.detailsReviewed ? existing?.detailsReviewedAt ?? new Date() : null,
        featured: input.featured,
        categories: {
          deleteMany: {},
          create: categories.map(({ id }, position) => ({ categoryId: id, position })),
        },
        media: {
          deleteMany: {},
          create: input.mediaIds.map((mediaId, position) => ({ mediaId, position })),
        },
      },
    });
    if (existing?.variants.length) await tx.productVariant.updateMany({ where: { productId: product.id, active: true }, data: { position: { increment: 100 }, sku: null } });
    for (const variant of removedVariants) {
      await tx.productVariant.update({ where: { id: variant.id }, data: { active: false, sku: null, availability: "UNAVAILABLE", position: 1000 + variant.position } });
    }
    for (const [position, inputVariant] of normalizedVariants.entries()) {
      const oldVariant = inputVariant.id ? existing?.variants.find((variant) => variant.id === inputVariant.id) : undefined;
      const variant = oldVariant
        ? await tx.productVariant.update({ where: { id: oldVariant.id }, data: { nameAr: inputVariant.nameAr, nameEn: inputVariant.nameEn, sku: inputVariant.sku, priceMinor: inputVariant.priceMinor, options: inputVariant.options ?? {}, widthMm: inputVariant.widthMm, heightMm: inputVariant.heightMm, depthMm: inputVariant.depthMm, weightGrams: inputVariant.weightGrams, active: true, position } })
        : await tx.productVariant.create({ data: { productId: product.id, nameAr: inputVariant.nameAr, nameEn: inputVariant.nameEn, sku: inputVariant.sku, priceMinor: inputVariant.priceMinor, options: inputVariant.options ?? {}, widthMm: inputVariant.widthMm, heightMm: inputVariant.heightMm, depthMm: inputVariant.depthMm, weightGrams: inputVariant.weightGrams, active: true, position } });
      if (input.type === "READY_MADE") {
        let balance = await tx.inventoryBalance.findUnique({ where: { variantId: variant.id } });
        if (!balance) {
          const quantity = inputVariant.quantity;
          if (quantity === null) continue;
          balance = await tx.inventoryBalance.create({ data: { productId: product.id, variantId: variant.id, quantity, lowStockAt: 1 } });
          await tx.inventoryMovement.create({ data: { balanceId: balance.id, kind: "OPENING", delta: quantity, balanceAfter: quantity, reason: oldVariant ? "تسجيل رصيد ابتدائي للمتغير الجاهز" : "رصيد افتتاحي عند إضافة المنتج", actorId: actor.id, actorLabel: actor.name } });
        }
        await tx.productVariant.update({ where: { id: variant.id }, data: { availability: balance.quantity > 0 ? "AVAILABLE" : "UNAVAILABLE" } });
      }
    }
    if (input.type === "READY_MADE") {
      const totalStock = (await tx.inventoryBalance.aggregate({ where: { productId: product.id, variant: { active: true } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
      await tx.product.update({ where: { id: product.id }, data: { availability: totalStock > 0 ? "AVAILABLE" : "UNAVAILABLE" } });
    } else {
      const policy = await tx.manufacturingPolicy.findUnique({ where: { productId: product.id }, select: { available: true } });
      await tx.product.update({ where: { id: product.id }, data: { availability: policy?.available ? "AVAILABLE" : "UNAVAILABLE" } });
    }
    if (input.mediaIds.length) await tx.mediaAsset.updateMany({ where: { id: { in: input.mediaIds } }, data: { lastReferencedAt: new Date() } });
    await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: created ? "product.created" : "product.updated", entity: "Product", entityId: product.id, afterData: { titleAr: product.titleAr, slug: product.slug, type: product.type, priceMinor: product.priceMinor } } });
    return product;
  });
  revalidateStorefront(saved.slug);
  redirect("/admin/products/" + saved.id + "?saved=1");
}

export async function publishProduct(id: string, publish: boolean): Promise<void> {
  const actor = await requirePermission("PRODUCTS_PUBLISH");
  if (!uuid.safeParse(id).success) redirect("/admin/products?error=missing");
  const db = getDatabase();
  const status = publish ? "PUBLISHED" : "DRAFT";
  let product: { id: string; slug: string };
  try {
    product = await db.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id }, include: { media: true, variants: { where: { active: true, }, include: { inventory: true } }, manufacturingPolicy: true, categories: { include: { category: true } } } });
      if (!current) throw new Error("NOT_FOUND");
      if (current.status === "ARCHIVED") throw new Error("PUBLISH_BLOCKED");
      if (publish && productPublicationBlockers(current).length) throw new Error("PUBLISH_BLOCKED");
      await tx.product.update({ where: { id }, data: { status, publishedAt: publish ? new Date() : null } });
      await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: publish ? "product.published" : "product.unpublished", entity: "Product", entityId: id, beforeData: { status: current.status }, afterData: { status } } });
      return { id: current.id, slug: current.slug };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") redirect("/admin/products?error=missing");
    if (error instanceof Error && error.message === "PUBLISH_BLOCKED") redirect("/admin/products/" + id + "?error=publish");
    throw error;
  }
  revalidateStorefront(product.slug);
  redirect("/admin/products/" + id + "?saved=1");
}

export async function archiveProduct(id: string): Promise<void> {
  const actor = await requirePermission("PRODUCTS_WRITE");
  if (!uuid.safeParse(id).success) redirect("/admin/products?error=missing");
  const product = await getDatabase().product.findUnique({ where: { id } });
  if (!product) redirect("/admin/products?error=missing");
  if (product.status === "PUBLISHED") await requirePermission("PRODUCTS_PUBLISH");
  await getDatabase().$transaction([
    getDatabase().product.update({ where: { id }, data: { status: "ARCHIVED" } }),
    getDatabase().auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "product.archived", entity: "Product", entityId: id, beforeData: { status: product.status }, afterData: { status: "ARCHIVED" } } }),
  ]);
  revalidateStorefront(product.slug);
  redirect("/admin/products?saved=archived");
}

const bulkReviewFields = z.object({
  titleAr: z.string().trim().min(2).max(191),
  type: z.enum(["", "READY_MADE", "MADE_TO_ORDER"]),
  price: z.string().trim().max(16),
  categoryId: z.string().uuid().optional(),
  detailsReviewed: z.boolean(),
  newVariantNameAr: z.string().trim().max(191),
  initialQuantity: z.string().max(8),
});

export async function saveBulkProductReview(formData: FormData): Promise<void> {
  const actor = await requirePermission("PRODUCTS_WRITE");
  const intent = String(formData.get("intent") ?? "save");
  const ids = formData.getAll("productIds").map(String);
  if (!["save", "publish"].includes(intent) || !ids.length || ids.length > 25 || new Set(ids).size !== ids.length || ids.some((id) => !uuid.safeParse(id).success)) {
    redirect("/admin/products/review?error=invalid");
  }
  const publishIds = formData.getAll("selectedIds").map(String);
  if (new Set(publishIds).size !== publishIds.length || publishIds.some((id) => !ids.includes(id))) redirect("/admin/products/review?error=invalid");
  if (intent === "publish" && (!publishIds.length || publishIds.length > 25)) redirect("/admin/products/review?error=select");
  if (intent === "publish") await requirePermission("PRODUCTS_PUBLISH");

  const entries = ids.map((id) => {
    const parsed = bulkReviewFields.safeParse({
      titleAr: formData.get("titleAr_" + id),
      type: String(formData.get("type_" + id) ?? ""),
      price: String(formData.get("price_" + id) ?? ""),
      categoryId: String(formData.get("categoryId_" + id) ?? "") || undefined,
      detailsReviewed: formData.get("detailsReviewed_" + id) === "on",
      newVariantNameAr: String(formData.get("newVariantNameAr_" + id) ?? ""),
      initialQuantity: String(formData.get("initialQuantity_" + id) ?? ""),
    });
    if (!parsed.success) redirect("/admin/products/review?error=invalid");
    let priceMinor: number | null;
    try { priceMinor = minorUnits(parsed.data.price); } catch { redirect("/admin/products/review?error=invalid"); }
    let initialQuantity: number | null = null;
    if (parsed.data.newVariantNameAr || parsed.data.initialQuantity) {
      if (!parsed.data.newVariantNameAr || !parsed.data.initialQuantity || parsed.data.type === "MADE_TO_ORDER") redirect("/admin/products/review?error=variant");
      try { initialQuantity = intField(parsed.data.initialQuantity); } catch { redirect("/admin/products/review?error=variant"); }
    }
    return { id, ...parsed.data, priceMinor, initialQuantity };
  });
  const db = getDatabase();
  try {
    await db.$transaction(async (tx) => {
      const currentRows = await tx.product.findMany({
        where: { id: { in: ids } },
        include: { variants: { where: { active: true }, include: { inventory: true } }, inventory: true, categories: { include: { category: true } }, manufacturingPolicy: true },
      });
      if (currentRows.length !== ids.length) throw new Error("NOT_FOUND");
      if (currentRows.some((row) => row.status === "PUBLISHED") && !hasPermission(actor.roleCode, "PRODUCTS_PUBLISH")) throw new Error("FORBIDDEN");
      for (const entry of entries) {
        const current = currentRows.find((row) => row.id === entry.id);
        if (!current) throw new Error("NOT_FOUND");
        const nextType = entry.type || current.type;
        if (current.type === "READY_MADE" && nextType === "MADE_TO_ORDER" && current.inventory.some((balance) => balance.quantity > 0)) throw new Error("TYPE_STOCK");
        if (entry.categoryId) {
          const category = await tx.category.findUnique({ where: { id: entry.categoryId }, select: { id: true, visible: true, reviewRequired: true } });
          if (!category || !category.visible || category.reviewRequired) throw new Error("CATEGORY");
        }
        if (entry.initialQuantity !== null && (current.type && current.type !== "READY_MADE" || nextType !== "READY_MADE" || current.variants.length)) throw new Error("VARIANT");
        const nextPrice = entry.priceMinor;
        await tx.product.update({
          where: { id: current.id },
          data: {
            titleAr: entry.titleAr,
            type: nextType,
            priceMinor: nextPrice,
            detailsReviewedAt: entry.detailsReviewed ? current.detailsReviewedAt ?? new Date() : null,
          },
        });
        if (entry.categoryId) await tx.productCategory.createMany({ data: [{ productId: current.id, categoryId: entry.categoryId, position: current.categories.length }], skipDuplicates: true });
        if (entry.initialQuantity !== null) {
          const variant = await tx.productVariant.create({ data: { productId: current.id, nameAr: entry.newVariantNameAr, priceMinor: nextPrice, availability: entry.initialQuantity > 0 ? "AVAILABLE" : "UNAVAILABLE", position: 0 } });
          const balance = await tx.inventoryBalance.create({ data: { productId: current.id, variantId: variant.id, quantity: entry.initialQuantity, lowStockAt: 1 } });
          await tx.inventoryMovement.create({ data: { balanceId: balance.id, kind: "OPENING", delta: entry.initialQuantity, balanceAfter: entry.initialQuantity, reason: "رصيد افتتاحي مسجل أثناء مراجعة الكتالوج", actorId: actor.id, actorLabel: actor.name } });
        }
        if (nextType === "READY_MADE") {
          const totalStock = (await tx.inventoryBalance.aggregate({ where: { productId: current.id, variant: { active: true } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
          await tx.product.update({ where: { id: current.id }, data: { availability: totalStock > 0 ? "AVAILABLE" : "UNAVAILABLE" } });
        } else if (nextType === "MADE_TO_ORDER") {
          await tx.product.update({ where: { id: current.id }, data: { availability: current.manufacturingPolicy?.available ? "AVAILABLE" : "UNAVAILABLE" } });
        }
        await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "product.bulk-reviewed", entity: "Product", entityId: current.id, beforeData: { titleAr: current.titleAr, type: current.type, priceMinor: current.priceMinor, detailsReviewedAt: current.detailsReviewedAt }, afterData: { titleAr: entry.titleAr, type: nextType, priceMinor: nextPrice, detailsReviewed: entry.detailsReviewed, categoryId: entry.categoryId ?? null, initialQuantity: entry.initialQuantity } } });
      }
      if (intent === "publish") {
        const rows = await tx.product.findMany({ where: { id: { in: publishIds } }, include: { media: true, variants: { where: { active: true }, include: { inventory: true } }, manufacturingPolicy: true, categories: { include: { category: true } } } });
        const byId = new Map(rows.map((row) => [row.id, row]));
        for (const id of publishIds) {
          const product = byId.get(id);
          if (!product || productPublicationBlockers(product).length) throw new Error("PUBLISH_BLOCKED");
          await tx.product.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
          await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "product.published", entity: "Product", entityId: id, beforeData: { status: product.status }, afterData: { status: "PUBLISHED", source: "bulk-review" } } });
        }
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") redirect("/admin/products/review?error=missing");
    if (code === "FORBIDDEN") redirect("/admin/products/review?error=permission");
    if (code === "TYPE_STOCK") redirect("/admin/products/review?error=stock");
    if (code === "CATEGORY") redirect("/admin/products/review?error=category");
    if (code === "VARIANT") redirect("/admin/products/review?error=variant");
    if (code === "PUBLISH_BLOCKED") redirect("/admin/products/review?error=publish");
    throw error;
  }
  revalidatePath("/admin/products");
  revalidatePath("/admin/products/review");
  revalidatePath("/admin");
  revalidateStorefront();
  redirect("/admin/products/review?saved=" + (intent === "publish" ? "published" : "1"));
}

export async function duplicateProduct(id: string): Promise<void> {
  const actor = await requirePermission("PRODUCTS_WRITE");
  if (!uuid.safeParse(id).success) redirect("/admin/products?error=missing");
  const db = getDatabase();
  const source = await db.product.findUnique({ where: { id }, include: { categories: true, media: true } });
  if (!source) redirect("/admin/products?error=missing");
  const copy = await db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        titleAr: source.titleAr + " - نسخة",
        titleEn: source.titleEn,
        descriptionAr: source.descriptionAr,
        descriptionEn: source.descriptionEn,
        slug: source.slug + "-copy-" + crypto.randomUUID().slice(0, 8),
        type: source.type,
        status: "DRAFT",
        availability: "UNAVAILABLE",
        priceMinor: null,
        categories: { create: source.categories.map(({ categoryId, position }) => ({ categoryId, position })) },
        media: { create: source.media.map(({ mediaId, position }) => ({ mediaId, position })) },
      },
    });
    await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "product.duplicated", entity: "Product", entityId: product.id, afterData: { sourceId: source.id } } });
    return product;
  });
  redirect("/admin/products/" + copy.id + "?saved=1");
}

const categorySchema = z.object({ id: z.string().optional(), nameAr: z.string().trim().min(2).max(191), nameEn: z.string().trim().max(191).optional(), slug: z.string().trim().min(2).max(191).regex(/^[\p{L}\p{N}-]+$/u), descriptionAr: z.string().max(2000).optional(), sortOrder: z.number().int().min(0).max(9999), visible: z.boolean(), featured: z.boolean(), reviewRequired: z.boolean(), parentId: z.string().optional(), imageAssetId: z.string().optional() });
export async function saveCategory(formData: FormData): Promise<void> {
  const actor = await requirePermission("CATEGORIES_WRITE");
  const data = {
    id: String(formData.get("id") ?? "") || undefined,
    nameAr: String(formData.get("nameAr") ?? ""),
    nameEn: String(formData.get("nameEn") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    descriptionAr: String(formData.get("descriptionAr") ?? ""),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
    visible: formData.get("visible") === "on",
    parentId: String(formData.get("parentId") ?? "") || undefined,
    reviewRequired: formData.get("reviewRequired") !== "on",
    imageAssetId: String(formData.get("imageAssetId") ?? "") || undefined,
    featured: formData.get("featured") === "on",
  };
  const parsed = categorySchema.safeParse(data);
  if (!parsed.success) redirect("/admin/categories?error=invalid");
  const value = parsed.data;
  const db = getDatabase();
  if (value.parentId && (!uuid.safeParse(value.parentId).success || value.parentId === value.id)) redirect("/admin/categories?error=hierarchy");
  if (value.imageAssetId && !uuid.safeParse(value.imageAssetId).success) redirect("/admin/categories?error=media");
  if (value.id && value.parentId) {
    let ancestorId: string | null | undefined = value.parentId;
    const seen = new Set<string>();
    while (ancestorId) {
      if (ancestorId === value.id || seen.has(ancestorId)) redirect("/admin/categories?error=hierarchy");
      seen.add(ancestorId);
      const ancestor: { parentId: string | null } | null = await db.category.findUnique({ where: { id: ancestorId }, select: { parentId: true } });
      ancestorId = ancestor?.parentId;
    }
  }
  const category = await db.category.upsert({
    where: { id: value.id ?? "00000000-0000-0000-0000-000000000000" },
    create: { nameAr: value.nameAr, nameEn: value.nameEn || null, slug: value.slug, descriptionAr: value.descriptionAr || null, sortOrder: value.sortOrder, visible: value.visible, featured: value.featured, reviewRequired: value.reviewRequired, parentId: value.parentId ?? null, imageAssetId: value.imageAssetId ?? null },
    update: { nameAr: value.nameAr, nameEn: value.nameEn || null, slug: value.slug, descriptionAr: value.descriptionAr || null, sortOrder: value.sortOrder, visible: value.visible, featured: value.featured, reviewRequired: value.reviewRequired, parentId: value.parentId ?? null, imageAssetId: value.imageAssetId ?? null },
  });
  await audit(actor, value.id ? "category.updated" : "category.created", "Category", category.id, value);
  revalidateStorefront();
  redirect("/admin/categories?saved=1");
}

export async function adjustInventory(formData: FormData): Promise<void> {
  const actor = await requirePermission("INVENTORY_ADJUST");
  const variantId = String(formData.get("variantId") ?? "");
  const deltaRaw = String(formData.get("delta") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const requestKey = String(formData.get("requestKey") ?? "");
  if (!uuid.safeParse(variantId).success || !uuid.safeParse(requestKey).success || !/^-?\d{1,7}$/.test(deltaRaw) || !reason || reason.length > 500) redirect("/admin/inventory?error=invalid");
  const delta = Number(deltaRaw);
  if (!Number.isSafeInteger(delta) || delta === 0) redirect("/admin/inventory?error=invalid");
  const db = getDatabase();
  try {
    await db.$transaction(async (tx) => {
      if (await tx.inventoryMovement.findUnique({ where: { requestKey }, select: { id: true } })) throw new Error("DUPLICATE_REQUEST");
      const balance = await tx.inventoryBalance.findUnique({ where: { variantId } });
      if (!balance) throw new Error("NOT_FOUND");
      const affected = await tx.$executeRaw`UPDATE inventory_balances SET quantity = quantity + ${delta}, version = version + 1, updatedAt = CURRENT_TIMESTAMP(3) WHERE id = ${balance.id} AND quantity + ${delta} >= 0 AND version = ${balance.version}`;
      if (affected !== 1) throw new Error("STOCK_CONFLICT");
      const updated = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
      await tx.inventoryMovement.create({ data: { balanceId: balance.id, kind: "ADJUSTMENT", delta, balanceAfter: updated.quantity, reason, requestKey, actorId: actor.id, actorLabel: actor.name } });
      const totalStock = (await tx.inventoryBalance.aggregate({ where: { productId: balance.productId, variant: { active: true } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
      await tx.product.update({ where: { id: balance.productId }, data: { availability: totalStock > 0 ? "AVAILABLE" : "UNAVAILABLE" } });
      await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "inventory.adjusted", entity: "InventoryBalance", entityId: balance.id, beforeData: { quantity: balance.quantity, version: balance.version }, afterData: { quantity: updated.quantity, version: updated.version, delta, reason } } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") redirect("/admin/inventory?error=missing");
    const replay = await db.inventoryMovement.findUnique({ where: { requestKey }, select: { id: true } }).catch(() => null);
    if (replay || error instanceof Error && error.message === "DUPLICATE_REQUEST") redirect("/admin/inventory?saved=replay");
    redirect("/admin/inventory?error=stock");
  }
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidateStorefront();
  redirect("/admin/inventory?saved=1");
}

export async function setLowStockThreshold(formData: FormData): Promise<void> {
  const actor = await requirePermission("INVENTORY_ADJUST");
  const variantId = String(formData.get("variantId") ?? "");
  const thresholdRaw = String(formData.get("lowStockAt") ?? "");
  if (!uuid.safeParse(variantId).success || !/^\d{1,7}$/.test(thresholdRaw)) redirect("/admin/inventory?error=invalid");
  const lowStockAt = Number(thresholdRaw);
  const db = getDatabase();
  const balance = await db.inventoryBalance.findUnique({ where: { variantId } });
  if (!balance) redirect("/admin/inventory?error=missing");
  try {
    await db.$transaction([
      db.inventoryBalance.update({ where: { id: balance.id, version: balance.version }, data: { lowStockAt, version: { increment: 1 } } }),
      db.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "inventory.low-stock-threshold-updated", entity: "InventoryBalance", entityId: balance.id, beforeData: { lowStockAt: balance.lowStockAt }, afterData: { lowStockAt } } }),
    ]);
  } catch { redirect("/admin/inventory?error=stock"); }
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect("/admin/inventory?saved=1");
}

export async function saveManufacturingPolicy(formData: FormData): Promise<void> {
  const actor = await requirePermission("PRODUCTS_WRITE");
  const productId = String(formData.get("productId") ?? "");
  const minDays = intField(String(formData.get("minDays") ?? ""));
  const maxDays = intField(String(formData.get("maxDays") ?? ""));
  const depositMode = String(formData.get("depositMode") ?? "");
  const depositType = String(formData.get("depositType") ?? "");
  const balanceCollection = String(formData.get("balanceCollection") ?? "");
  const codBalanceEligible = formData.get("codBalanceEligible") === "on";
  const available = formData.get("available") === "on";
  if (!uuid.safeParse(productId).success || minDays < 1 || maxDays < minDays || maxDays > 365 || !["FULL_ADVANCE", "DEPOSIT"].includes(depositMode) || !["FIXED_MINOR", "PERCENT"].includes(depositType) || !["BEFORE_DISPATCH", "CASH_ON_DELIVERY"].includes(balanceCollection)) redirect("/admin/products/" + productId + "?error=policy");
  const db = getDatabase();
  let value: number;
  try {
    value = depositType === "FIXED_MINOR" ? minorUnits(String(formData.get("depositValue") ?? "")) ?? 0 : intField(String(formData.get("depositValue") ?? ""));
  } catch { redirect("/admin/products/" + productId + "?error=policy"); }
  const product = await db.product.findUnique({ where: { id: productId, type: "MADE_TO_ORDER" }, include: { variants: { where: { active: true }, select: { priceMinor: true } } } });
  if (!product) redirect("/admin/products?error=missing");
  if (depositMode === "DEPOSIT" && value < 1) redirect("/admin/products/" + productId + "?error=policy");
  if (depositMode === "DEPOSIT" && depositType === "PERCENT" && value > 100) redirect("/admin/products/" + productId + "?error=policy");
  const applicablePrice = product.priceMinor ?? product.variants.map((variant) => variant.priceMinor).filter((price): price is number => price !== null).sort((a, b) => a - b)[0] ?? null;
  if (depositMode === "DEPOSIT" && depositType === "FIXED_MINOR" && (applicablePrice === null || value > applicablePrice)) redirect("/admin/products/" + productId + "?error=policy");
  const data = { available, minProductionDays: minDays, maxProductionDays: maxDays, depositMode: depositMode as "FULL_ADVANCE" | "DEPOSIT", depositType: depositType as "FIXED_MINOR" | "PERCENT", depositValue: depositMode === "FULL_ADVANCE" ? 100 : value, balanceCollection: balanceCollection as "BEFORE_DISPATCH" | "CASH_ON_DELIVERY", codBalanceEligible: codBalanceEligible && balanceCollection === "CASH_ON_DELIVERY", updatedById: actor.id };
  await db.$transaction([
    db.manufacturingPolicy.upsert({ where: { productId }, create: { productId, ...data }, update: data }),
    db.product.update({ where: { id: productId }, data: { availability: available ? "AVAILABLE" : "UNAVAILABLE" } }),
    db.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "manufacturing-policy.updated", entity: "ManufacturingPolicy", entityId: productId, afterData: data } }),
  ]);
  redirect("/admin/products/" + productId + "?saved=1");
}

export async function reorderProductMedia(formData: FormData): Promise<void> {
  const actor = await requirePermission("MEDIA_WRITE");
  const productId = String(formData.get("productId") ?? "");
  if (!uuid.safeParse(productId).success) redirect("/admin/products?error=missing");
  const db = getDatabase();
  const relations = await db.productMedia.findMany({ where: { productId }, select: { mediaId: true } });
  if (!relations.length) redirect("/admin/products/" + productId + "?error=media");
  const order = relations.map(({ mediaId }) => ({ mediaId, position: Number(formData.get("position_" + mediaId)) }));
  if (order.some(({ position }) => !Number.isInteger(position) || position < 0 || position > 99) || new Set(order.map(({ position }) => position)).size !== order.length) redirect("/admin/products/" + productId + "?error=media");
  order.sort((a, b) => a.position - b.position);
  const product = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (!product) redirect("/admin/products?error=missing");
  await db.$transaction(async (tx) => {
    // Clear positions first because MySQL enforces the per-product unique position index immediately.
    await tx.productMedia.updateMany({ where: { productId }, data: { position: { increment: 100 } } });
    for (const [position, item] of order.entries()) await tx.productMedia.update({ where: { productId_mediaId: { productId, mediaId: item.mediaId } }, data: { position } });
    await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "product.media-reordered", entity: "Product", entityId: productId, afterData: order } });
  });
  revalidateStorefront(product.slug);
  redirect("/admin/products/" + productId + "?saved=1");
}

export async function saveStoreSettings(formData: FormData): Promise<void> {
  const actor = await requirePermission("SETTINGS_WRITE");
  const fields = ["phone", "whatsapp", "email", "descriptionAr"] as const;
  const data = {
    phone: String(formData.get("phone") ?? "").trim(),
    whatsapp: String(formData.get("whatsapp") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    descriptionAr: String(formData.get("descriptionAr") ?? "").trim(),
  };
  if (!/^\+?[\d\s()-]{7,30}$/.test(data.phone) || (data.whatsapp && !/^\+?[\d\s()-]{7,30}$/.test(data.whatsapp)) || (data.email && !z.string().email().safeParse(data.email).success) || data.descriptionAr.length > 2000) redirect("/admin/settings?error=invalid");
  const db = getDatabase();
  await db.$transaction(async (tx) => {
    for (const key of fields) {
      await tx.storeSetting.upsert({ where: { key }, create: { key, value: data[key], updatedBy: actor.id }, update: { value: data[key], updatedBy: actor.id } });
    }
    await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "store-settings.updated", entity: "StoreSetting", entityId: "contact", afterData: data } });
  });
  revalidateStorefront();
  redirect("/admin/settings?saved=1");
}

export async function changeAdminPassword(formData: FormData): Promise<"ok" | "invalid" | "current" | "unauthenticated"> {
  const actor = await getAdminActor();
  if (!actor) return "unauthenticated";
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (newPassword.length < 12 || newPassword.length > 128 || newPassword !== confirmPassword || currentPassword.length > 128) return "invalid";
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || session.user.id !== actor.id) return "unauthenticated";
  const db = getDatabase();
  const account = await db.authAccount.findFirst({ where: { userId: actor.id, providerId: "credential" }, select: { id: true, password: true } });
  if (!account?.password || !await verifyPassword({ hash: account.password, password: currentPassword })) return "current";
  const password = await hashPassword(newPassword);
  await db.$transaction([
    db.authAccount.update({ where: { id: account.id }, data: { password } }),
    db.adminUser.update({ where: { id: actor.id }, data: { forcePasswordChange: false } }),
    db.authSession.deleteMany({ where: { userId: actor.id, id: { not: session.session.id } } }),
    db.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "admin.password-changed", entity: "AdminUser", entityId: actor.id } }),
  ]);
  revalidatePath("/admin");
  return "ok";
}

export async function createStaffAccount(formData: FormData): Promise<void> {
  const actor = await requirePermission("STAFF_MANAGE");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleCode = String(formData.get("roleCode") ?? "");
  const parsed = z.object({ email: z.string().email().max(191), name: z.string().min(2).max(120), password: z.string().min(12).max(128), roleCode: z.enum(["MANAGER", "CATALOG_EDITOR", "INVENTORY_STAFF"]) }).safeParse({ email, name, password, roleCode });
  if (!parsed.success) redirect("/admin/staff?error=invalid");
  const db = getDatabase();
  if (await db.adminUser.findUnique({ where: { email }, select: { id: true } })) redirect("/admin/staff?error=exists");
  const hashed = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.adminUser.create({ data: { email, name, roleCode: parsed.data.roleCode, emailVerified: true, forcePasswordChange: true } });
    await tx.authAccount.create({ data: { id: crypto.randomUUID(), accountId: created.id, providerId: "credential", userId: created.id, password: hashed } });
    await tx.auditEvent.create({ data: { actorId: actor.id, actorLabel: actor.name, action: "admin-user.created", entity: "AdminUser", entityId: created.id, afterData: { email, roleCode: created.roleCode } } });
    return created;
  });
  redirect("/admin/staff?saved=" + encodeURIComponent(user.name));
}
