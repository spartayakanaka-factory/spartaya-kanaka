import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { createRuntimeDatabase } from "./runtime-db";
import { fixturePolicy, fixtureProduct, fixtureRate } from "../src/lib/commerce/fixtures";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
async function main() {
  assertCommerceEnvironment();
  const url = new URL(process.env.DATABASE_URL!);
  if (
    url.username !== "sprtaya_phase5" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "33078" ||
    url.pathname !== "/sprtaya_phase5_disposable_local"
  )
    throw Error("Exact Phase 5 fixture target required");
  const file = path.join(process.env.P3_STATE_DIR!, "staff.json");
  if (existsSync(file)) {
    console.log("Phase 5 synthetic staff already provisioned; preserving private credentials.");
    return;
  }
  const db = createRuntimeDatabase();
  let step = "inspect";
  try {
    if (await db.legacyProductMapping.count()) throw Error("Seed must precede imported drafts");
    await fixturePolicy(db);
    await fixtureRate(db);
    for (const [suffix, type, quantity] of [
      ["ready", "READY_MADE", 20],
      ["made", "MADE_TO_ORDER", 0],
    ] as const)
      if (!(await db.product.findUnique({ where: { slug: "p3-synthetic-" + suffix } })))
        await fixtureProduct(db, suffix, type, quantity);
    const products = await db.product.findMany({
      where: { slug: { in: ["p3-synthetic-ready", "p3-synthetic-made"] } },
      include: { variants: true },
    });
    if (products.length !== 2) throw Error("Base synthetic product fixtures required");
    let media = await db.mediaAsset.findFirst();
    if (!media) {
      const catalog = JSON.parse(
        readFileSync("sprtaya-kanaka-assets/بيانات/products.json", "utf8"),
      );
      const image = catalog[0].images.find(
        (i: { status: string; local_path?: string }) => i.status === "downloaded" && i.local_path,
      );
      if (!image || !existsSync(path.join(process.env.LEGACY_ASSET_ROOT!, image.local_path)))
        throw Error("Original local illustration required");
      media = await db.mediaAsset.create({
        data: {
          provider: "LEGACY_LOCAL",
          originalKey: "legacy:" + image.local_path,
          mimeType: image.mime_type || "image/webp",
          altAr: "صورة نحاس أصلية توضيحية للاختبار",
        },
      });
    }
    step = "category";
    const category = await db.category.upsert({
      where: { slug: "p5-synthetic" },
      create: {
        slug: "p5-synthetic",
        nameAr: "قطع اختبار محلية",
        nameEn: "Synthetic local fixtures",
        visible: true,
        reviewRequired: false,
        imageAssetId: media.id,
      },
      update: {},
    });
    step = "links";
    for (const p of products) {
      await db.productCategory.upsert({
        where: { productId_categoryId: { productId: p.id, categoryId: category.id } },
        create: { productId: p.id, categoryId: category.id },
        update: {},
      });
      await db.productMedia.upsert({
        where: { productId_mediaId: { productId: p.id, mediaId: media.id } },
        create: { productId: p.id, mediaId: media.id, position: 0 },
        update: {},
      });
    }
    step = "staff";
    const staff = [];
    for (const [i, role] of ["OWNER", "MANAGER", "MANAGER"].entries()) {
      const password = randomBytes(24).toString("base64url"),
        email = `${role.toLowerCase()}-${i}@phase5.invalid`;
      const user = await db.adminUser.create({
        data: {
          name: ["مالك المصنع التجريبي", "مدير التشغيل التجريبي", "مسؤول التسوية التجريبي"][i],
          email,
          roleCode: role,
          emailVerified: true,
          forcePasswordChange: true,
        },
      });
      await db.authAccount.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          userId: user.id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      });
      for (const operation of [
        "PAYMENT_VERIFY",
        "REFUND_REQUEST",
        "REFUND_APPROVE",
        "REFUND_EXECUTE",
        "RECONCILE",
      ])
        await db.commerceFinanceGrant.create({
          data: {
            adminId: user.id,
            operation,
            currency: "EGP",
            limitMinor: BigInt(1000000),
            expiresAt: new Date(Date.now() + 86400000 * 30),
          },
        });
      staff.push({ id: user.id, email, password, forcePasswordChange: true });
    }
    const ready = products.find((p) => p.type === "READY_MADE")!,
      made = products.find((p) => p.type === "MADE_TO_ORDER")!,
      rate = await db.shippingRate.findFirstOrThrow();
    writeFileSync(
      file,
      JSON.stringify({
        staff,
        ready: { id: ready.id, variantId: ready.variants[0].id, slug: ready.slug },
        made: { id: made.id, variantId: made.variants[0].id, slug: made.slug },
        rateId: rate.id,
      }),
      { mode: 0o600 },
    );
    console.log(
      "Created Phase 5 synthetic owner/manager accounts, product links and private local fixture file.",
    );
  } catch (e) {
    console.error(
      "Fixture step failed",
      step,
      e instanceof Error ? e.name : "unknown",
      (e as { code?: string }).code ?? "",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Phase 5 seed refused; private diagnostics withheld.");
  process.exitCode = 1;
});
