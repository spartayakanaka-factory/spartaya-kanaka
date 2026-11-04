import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDatabase } from "../src/lib/server/database";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { cairoDayStart, nextDate } from "../src/lib/reports/calendar";
import { getProductImageUrl } from "../src/lib/asset-url";
async function main() {
  assertCommerceEnvironment();
  if (new URL(process.env.DATABASE_URL!).pathname !== "/sprtaya_phase4_disposable_local")
    throw Error("Wrong fixture target");
  const db = getDatabase();
  try {
    const f = JSON.parse(readFileSync(path.join(process.env.P3_STATE_DIR!, "staff.json"), "utf8"));
    const source = await db.product.findUniqueOrThrow({
      where: { id: f.ready.id },
      include: { media: { include: { media: true }, take: 1 } },
    });
    if (!source.slug.startsWith("p3-synthetic-")) throw Error("Expected synthetic product");
    const day = nextDate("2030-01-01", Math.floor(Math.random() * 9000)),
      when = new Date(cairoDayStart(day).getTime() + 3600000),
      asset = source.media[0]?.media;
    const imageUrl = asset
      ? getProductImageUrl({
          localPath:
            asset.provider === "LEGACY_LOCAL" ? asset.originalKey.replace(/^legacy:/, "") : "",
          publicUrl: asset.publicUrl || undefined,
        })
      : null;
    await db.$transaction(async (tx) => {
      for (const [method, total, paid] of [
        ["WALLET", 10000, 5000],
        ["COD", 8000, 8000],
      ] as const) {
        const o = await tx.commerceOrder.create({
          data: {
            ownerKey: "guest:" + randomUUID(),
            requestKey: randomUUID(),
            requestHash: randomUUID(),
            state: method === "COD" ? "DELIVERED" : "CONFIRMED",
            paymentMethod: method,
            currency: "EGP",
            totalMinor: total,
            initialMinor: paid,
            paidMinor: paid,
            snapshot: { address: { recipient: "Synthetic local fixture" } },
            locale: "ar",
            expiresAt: new Date(when.getTime() + 86400000),
            createdAt: when,
          },
        });
        await tx.commerceOrderItem.create({
          data: {
            orderId: o.id,
            variantId: f.ready.variantId,
            quantity: 1,
            type: "READY_MADE",
            snapshot: {
              titleAr: "قطعة اختبار اصطناعية",
              titleEn: "Synthetic test piece",
              gross: String(total),
              imageUrl,
            },
          },
        });
        if (method === "WALLET") {
          const p = await tx.commercePayment.create({
            data: {
              orderId: o.id,
              requestKey: randomUUID(),
              method,
              purpose: "INITIAL",
              state: "SUCCEEDED",
              amountMinor: paid,
              currency: "EGP",
              providerReference: randomUUID(),
            },
          });
          await tx.commerceEvent.create({
            data: {
              orderId: o.id,
              actorKey: "staff:" + f.staff[0].id,
              kind: "payment.verified",
              operationKey: "fixture:" + randomUUID(),
              data: { paymentId: p.id, amount: String(paid), currency: "EGP" },
              createdAt: when,
            },
          });
        } else {
          await tx.commerceShipment.create({
            data: {
              orderId: o.id,
              state: "DELIVERED",
              collectionState: "RECONCILED",
              carrierReference: "SYNTHETIC",
            },
          });
          await tx.commerceEvent.create({
            data: {
              orderId: o.id,
              actorKey: "staff:" + f.staff[0].id,
              kind: "fulfillment.cod_reconciled",
              operationKey: `fulfill:${o.id}:cod_reconciled`,
              data: { reference: null },
              createdAt: when,
            },
          });
        }
      }
    });
    writeFileSync(
      path.join(process.env.P3_STATE_DIR!, "report-fixture.json"),
      JSON.stringify({ day, orders: 2, collected: "13000", outstanding: "5000" }),
      { mode: 0o600 },
    );
    console.log("Created isolated synthetic report fixtures; no merchant data used.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Synthetic report fixture failed");
  process.exitCode = 1;
});
