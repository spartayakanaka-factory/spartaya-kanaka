import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { createRuntimeDatabase } from "./runtime-db";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { fixturePolicy, fixtureProduct, fixtureRate } from "../src/lib/commerce/fixtures";
async function main() {
  assertCommerceEnvironment();
  const db = createRuntimeDatabase();
  try {
    const counts = await db.legacyProductMapping.count();
    if (counts) throw Error("Accepted/imported data found. Refusing fixture seed.");
    const file = path.join(
      process.env.P3_STATE_DIR!,
      process.argv.includes("--test") ? "test-staff.json" : "staff.json",
    );
    if (db && (await db.product.findFirst({ where: { slug: "p3-synthetic-ready" } }))) {
      console.log("Phase 3 fixtures already present; existing fixture state preserved.");
      return;
    }
    await fixturePolicy(db);
    const rate = await fixtureRate(db);
    const ready = await fixtureProduct(db, "ready", "READY_MADE", 20),
      made = await fixtureProduct(db, "made", "MADE_TO_ORDER", 0);
    const imageDirectory = path.resolve("sprtaya-kanaka-assets/المنتجات");
    const productDirs = readdirSync(imageDirectory, { withFileTypes: true }).filter((d) =>
      d.isDirectory(),
    );
    let relative = "";
    for (const dir of productDirs) {
      const file = readdirSync(path.join(imageDirectory, dir.name)).find((n) =>
        /\.(jpg|png|webp)$/i.test(n),
      );
      if (file) {
        relative = "المنتجات/" + dir.name + "/" + file;
        break;
      }
    }
    if (!relative) throw Error("Preserved genuine product image required");
    const media = await db.mediaAsset.create({
      data: {
        provider: "LEGACY_LOCAL",
        originalKey: "legacy:" + relative,
        mimeType: "image/webp",
        altAr: "صورة نحاس أصلية توضيحية للاختبار",
      },
    });
    const category = await db.category.create({
      data: {
        slug: "p3-synthetic",
        nameAr: "اختبار محلي فقط",
        nameEn: "Local test only",
        visible: true,
        reviewRequired: false,
        featured: true,
        imageAssetId: media.id,
      },
    });
    for (const p of [ready, made]) {
      await db.productMedia.create({ data: { productId: p.id, mediaId: media.id } });
      await db.productCategory.create({ data: { productId: p.id, categoryId: category.id } });
    }
    const staff = [];
    for (const [name, role] of [
      ["Local test owner", "OWNER"],
      ["Local approving manager", "MANAGER"],
      ["Local reconciler", "MANAGER"],
    ]) {
      const email = role.toLowerCase() + "-" + staff.length + "@phase3.invalid",
        password = randomBytes(24).toString("base64url");
      const user = await db.adminUser.create({
        data: { name, email, roleCode: role, emailVerified: true, forcePasswordChange: true },
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
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(
      file,
      JSON.stringify(
        {
          staff,
          ready: { id: ready.id, variantId: ready.variantId, slug: ready.slug },
          made: { id: made.id, variantId: made.variantId, slug: made.slug },
          rateId: rate.id,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Synthetic fixtures created on isolated Phase 3 target. Random staff credentials saved privately; rotation required. No accepted records imported or changed.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Synthetic seed failed; inspect disposable fixture state before retry.");
  process.exitCode = 1;
});
