import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { request } from "playwright";
import { createRuntimeDatabase } from "./runtime-db";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";

async function main() {
  assertCommerceEnvironment();
  const u = new URL(process.env.DATABASE_URL!);
  if (
    process.env.SR_LOCAL_ISOLATION !== "1" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "33078" ||
    u.username !== "sprtaya_sr_runtime" ||
    u.pathname !== "/sprtaya_sr_staging_local" ||
    process.env.P3_BASE_URL !== "http://localhost:3008"
  )
    throw new Error("Wrong local sandbox.");
  const state = process.env.P3_STATE_DIR!,
    base = process.env.P3_BASE_URL;
  const customer = JSON.parse(readFileSync(path.join(state, "customer.json"), "utf8"));
  const staff = JSON.parse(readFileSync(path.join(state, "staff.json"), "utf8")).staff[0];
  const fixture = JSON.parse(readFileSync(path.join(state, "staff.json"), "utf8"));
  const db = createRuntimeDatabase(),
    http = await request.newContext(),
    outsider = await request.newContext(),
    admin = await request.newContext();
  const rogueId = randomUUID(),
    rogueAdminId = randomUUID(),
    rogueEmail = "unapproved-" + randomBytes(8).toString("hex") + "@phase3.invalid",
    rogueAdminEmail = "unapproved-admin-" + randomBytes(8).toString("hex") + "@phase3.invalid",
    password = randomBytes(24).toString("base64url");
  try {
    const signUp = await outsider.post(base + "/api/customer-auth/sign-up/email", {
      headers: { origin: base },
      data: { name: "Synthetic unapproved", email: rogueEmail, password },
    });
    assert.notEqual(signUp.status(), 200, "public registration must be disabled");
    const guest = await outsider.post(base + "/api/commerce", {
      headers: { origin: base },
      data: { action: "cart", variantId: fixture.ready.variantId, quantity: 1 },
    });
    assert.equal(guest.status(), 401, "guest commerce must be denied");
    await db.customerUser.create({
      data: { id: rogueId, name: "Synthetic unapproved", email: rogueEmail, emailVerified: true },
    });
    await db.customerAccount.create({
      data: {
        id: randomUUID(),
        accountId: rogueId,
        userId: rogueId,
        providerId: "credential",
        password: await hashPassword(password),
      },
    });
    const rogue = await outsider.post(base + "/api/customer-auth/sign-in/email", {
      headers: { origin: base },
      data: { email: rogueEmail, password },
    });
    assert.notEqual(rogue.status(), 200, "unapproved user must not sign in");
    assert.equal(await db.customerSession.count({ where: { userId: rogueId } }), 0);
    await db.adminUser.create({
      data: {
        id: rogueAdminId,
        name: "Synthetic unapproved admin",
        email: rogueAdminEmail,
        roleCode: "OWNER",
        emailVerified: true,
        forcePasswordChange: false,
      },
    });
    await db.authAccount.create({
      data: {
        id: randomUUID(),
        accountId: rogueAdminId,
        userId: rogueAdminId,
        providerId: "credential",
        password: await hashPassword(password),
      },
    });
    const rogueAdmin = await outsider.post(base + "/api/auth/sign-in/email", {
      headers: { origin: base },
      data: { email: rogueAdminEmail, password },
    });
    assert.notEqual(rogueAdmin.status(), 200, "unapproved owner must not sign in");
    assert.equal(await db.authSession.count({ where: { userId: rogueAdminId } }), 0);
    const login = await http.post(base + "/api/customer-auth/sign-in/email", {
      headers: { origin: base },
      data: { email: customer.email, password: customer.password },
    });
    assert.equal(login.status(), 200, "approved synthetic customer login");
    const cart = await http.post(base + "/api/commerce", {
      headers: { origin: base },
      data: { action: "cart", variantId: fixture.ready.variantId, quantity: 1 },
    });
    assert.equal(cart.status(), 200, "approved customer cart");
    const clear = await http.post(base + "/api/commerce", {
      headers: { origin: base },
      data: { action: "cart", variantId: fixture.ready.variantId, quantity: 0 },
    });
    assert.equal(clear.status(), 200);
    const adminLogin = await admin.post(base + "/api/auth/sign-in/email", {
      headers: { origin: base },
      data: { email: staff.email, password: staff.password },
    });
    assert.equal(adminLogin.status(), 200, "approved owner login");
    const queue = await admin.get(base + "/api/admin/commerce?resource=workQueue");
    assert.equal(queue.status(), 200, "approved owner order queue");
    const noAdmin = await http.get(base + "/api/admin/commerce?resource=workQueue");
    assert.equal(noAdmin.status(), 403, "customer cannot use staff API");
    console.log(
      "PASS real approved customer/owner sessions, signup and guest denial, unapproved login denial, cart, and customer-to-staff boundary.",
    );
  } finally {
    await db.customerUser.deleteMany({ where: { id: rogueId } });
    await db.adminUser.deleteMany({ where: { id: rogueAdminId } });
    await db.$disconnect();
    await http.dispose();
    await outsider.dispose();
    await admin.dispose();
  }
}
main().catch(() => {
  console.error("Local synthetic authentication check failed; private diagnostics suppressed.");
  process.exitCode = 1;
});
