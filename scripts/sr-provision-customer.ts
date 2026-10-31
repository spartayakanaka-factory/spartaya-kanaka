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
  const file = path.join(process.env.P3_STATE_DIR!, "customer.json");
  if (existsSync(file)) throw new Error("Customer credentials exist; refusing reset.");
  const id = randomUUID(),
    email = "approved-" + randomBytes(8).toString("hex") + "@phase3.invalid",
    password = randomBytes(24).toString("base64url"),
    hash = await hashPassword(password);
  const db = createRuntimeDatabase();
  try {
    writeFileSync(file, JSON.stringify({ id, email, password }, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    await db.$transaction(async (tx) => {
      await tx.customerUser.create({
        data: { id, name: "Approved synthetic local customer", email, emailVerified: true },
      });
      await tx.customerAccount.create({
        data: {
          id: randomUUID(),
          accountId: id,
          userId: id,
          providerId: "credential",
          password: hash,
        },
      });
    });
    console.log("Provisioned one approved synthetic customer; credentials are stored privately.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Synthetic customer provisioning failed; private state retained for inspection.");
  process.exitCode = 1;
});
