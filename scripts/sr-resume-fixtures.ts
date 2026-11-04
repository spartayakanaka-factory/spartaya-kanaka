import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { createRuntimeDatabase } from "./runtime-db";

async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  if (
    process.env.SR_LOCAL_ISOLATION !== "1" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.username !== "sprtaya_sr_runtime" ||
    u.pathname !== "/sprtaya_sr_staging_local"
  )
    throw new Error("Wrong local target.");
  const file = path.join(process.env.P3_STATE_DIR!, "staff.json");
  if (existsSync(file)) throw new Error("Fixture credentials already exist; refusing reset.");
  const db = createRuntimeDatabase();
  try {
    if (
      (await db.legacyProductMapping.count()) ||
      (await db.adminUser.count()) ||
      (await db.product.count()) !== 2
    )
      throw new Error("Unexpected local fixture state.");
    const ready = await db.product.findUniqueOrThrow({
      where: { slug: "p3-synthetic-ready" },
      include: { variants: true },
    });
    const made = await db.product.findUniqueOrThrow({
      where: { slug: "p3-synthetic-made" },
      include: { variants: true },
    });
    const rate = await db.shippingRate.findFirstOrThrow({
      where: { region: "TEST-CAIRO", carrier: "SYNTHETIC-CARRIER" },
    });
    if (ready.variants.length !== 1 || made.variants.length !== 1)
      throw new Error("Unexpected fixture variants.");
    const staff = await Promise.all(
      ["OWNER", "MANAGER", "MANAGER"].map(async (role, i) => {
        const password = randomBytes(24).toString("base64url");
        return {
          id: randomUUID(),
          name: "Synthetic local " + role,
          role,
          email: `${role.toLowerCase()}-${i}@phase3.invalid`,
          password,
          hash: await hashPassword(password),
          forcePasswordChange: true,
        };
      }),
    );
    const output = {
      staff: staff.map((s) => ({
        id: s.id,
        email: s.email,
        password: s.password,
        forcePasswordChange: s.forcePasswordChange,
      })),
      ready: { id: ready.id, variantId: ready.variants[0].id, slug: ready.slug },
      made: { id: made.id, variantId: made.variants[0].id, slug: made.slug },
      rateId: rate.id,
    };
    writeFileSync(file, JSON.stringify(output, null, 2), { mode: 0o600, flag: "wx" });
    await db.$transaction(async (tx) => {
      for (const s of staff) {
        await tx.adminUser.create({
          data: {
            id: s.id,
            name: s.name,
            email: s.email,
            roleCode: s.role,
            emailVerified: true,
            forcePasswordChange: true,
          },
        });
        await tx.authAccount.create({
          data: {
            id: randomUUID(),
            accountId: s.id,
            userId: s.id,
            providerId: "credential",
            password: s.hash,
          },
        });
        for (const operation of [
          "PAYMENT_VERIFY",
          "REFUND_REQUEST",
          "REFUND_APPROVE",
          "REFUND_EXECUTE",
          "RECONCILE",
        ])
          await tx.commerceFinanceGrant.create({
            data: {
              adminId: s.id,
              operation,
              currency: "EGP",
              limitMinor: BigInt(1000000),
              expiresAt: new Date(Date.now() + 86400000 * 30),
            },
          });
      }
    });
    console.log("Completed synthetic local staff fixtures; credentials are stored privately.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Fixture recovery failed; private state retained for inspection.");
  process.exitCode = 1;
});
