import "server-only";
import { randomBytes } from "node:crypto";
import { demand } from "@/lib/commerce/policy";
import { assertCommerceEnvironment } from "@/lib/commerce/runtime";
import { customerIdentity } from "./customer-auth";
import { digest, type Shopper } from "./store";
import { getDatabase } from "../database";
export function cookieValue(headers: Headers, name: string) {
  return headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function guestShopper(headers: Headers) {
  const token = cookieValue(headers, "sprtaya-guest");
  return token && /^[a-f0-9]{64}$/.test(token) ? { key: "guest:" + digest(token) } : null;
}
export async function identity(
  headers: Headers,
  create = false,
): Promise<{ shopper: Shopper; setCookie?: string }> {
  assertCommerceEnvironment();
  const customer = await customerIdentity(headers);
  if (customer) return { shopper: { key: customer.key, userId: customer.user.id } };
  const guest = guestShopper(headers);
  if (guest) return { shopper: guest };
  demand(create, "GUEST_SESSION_REQUIRED", 401);
  const token = randomBytes(32).toString("hex");
  return {
    shopper: { key: "guest:" + digest(token) },
    setCookie: `sprtaya-guest=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}
export async function recoveryOrder(headers: Headers, id: string) {
  const token = cookieValue(headers, "sprtaya-order-session");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await getDatabase().commerceRecovery.findUnique({
    where: { sessionHash: digest(token) },
  });
  if (!row || row.orderId !== id || row.expiresAt < new Date() || !row.consumedAt) return null;
  const order = await getDatabase().commerceOrder.findUnique({
    where: { id },
    select: { ownerKey: true },
  });
  return order ? { key: order.ownerKey } : null;
}
export async function exchangeRecovery(token: string) {
  assertCommerceEnvironment();
  demand(/^[a-f0-9]{64}$/.test(token), "RECOVERY_INVALID", 400);
  const secret = randomBytes(32).toString("hex");
  const changed = await getDatabase().commerceRecovery.updateMany({
    where: { tokenHash: digest(token), consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date(), sessionHash: digest(secret) },
  });
  demand(changed.count === 1, "RECOVERY_INVALID", 400);
  return `sprtaya-order-session=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
