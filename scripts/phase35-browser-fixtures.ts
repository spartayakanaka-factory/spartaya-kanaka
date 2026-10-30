import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fixtureProduct } from "../src/lib/commerce/fixtures";
import path from "node:path";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { createRuntimeDatabase } from "./runtime-db";
async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  if (u.pathname !== "/sprtaya_phase35_disposable_local")
    throw Error("Phase 3.5 fixture target required");
  const db = createRuntimeDatabase();
  try {
    if (await db.legacyProductMapping.count()) throw Error("Imported data must remain unchanged");
    const fixture = JSON.parse(
      readFileSync(
        path.join(process.env.P3_STATE_DIR!, process.env.P3_STAFF_FILE || "staff.json"),
        "utf8",
      ),
    );
    const policy = await db.commercePolicy.findUniqueOrThrow({ where: { id: "local-synthetic" } });
    const instruction = {
      enabled: true,
      identifier: "LOCAL-TEST-NOT-PAYABLE",
      recipient: "Synthetic recipient - no real transfer",
      instructionsAr: "Local test only. Do not transfer real funds.",
      instructionsEn: "Local test only. Do not transfer real funds.",
    };
    await db.commercePolicy.update({
      where: { id: policy.id },
      data: {
        configuration: {
          ...(policy.configuration as object),
          manualInstructions: { WALLET: instruction, INSTAPAY: instruction },
        },
        version: { increment: 1 },
      },
    });
    for (const p of [fixture.ready, fixture.made]) {
      const product = await db.product.findUniqueOrThrow({ where: { id: p.id } });
      if (!product.slug.startsWith("p3-synthetic-")) throw Error("Unexpected fixture identity");
    }
    if (process.argv.includes("--fresh")) {
      const source = await db.product.findUniqueOrThrow({
        where: { id: fixture.ready.id },
        include: { media: true, categories: true },
      });
      const ready = await fixtureProduct(db, "factory-browser-" + randomUUID(), "READY_MADE", 20),
        made = await fixtureProduct(db, "factory-browser-made-" + randomUUID(), "MADE_TO_ORDER", 0);
      for (const p of [ready, made]) {
        for (const m of source.media)
          await db.productMedia.create({
            data: { productId: p.id, mediaId: m.mediaId, position: m.position },
          });
        for (const c of source.categories)
          await db.productCategory.create({
            data: { productId: p.id, categoryId: c.categoryId, position: c.position },
          });
      }
      writeFileSync(
        path.join(process.env.P3_STATE_DIR!, "factory-staff.json"),
        JSON.stringify({ ...fixture, ready, made }),
        { mode: 0o600 },
      );
    }
    console.log(
      "Configured synthetic non-payable manual instructions on the isolated Phase 3.5 fixture only.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Local fixture setup failed");
  process.exitCode = 1;
});
