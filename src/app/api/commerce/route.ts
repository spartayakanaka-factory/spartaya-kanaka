import { readJson } from "@/lib/server/commerce/http";
import { getStagingAccessResponse } from "@/lib/staging-access";
import { z } from "zod";
import { addressSchema, CommerceError, demand, jsonValue, methods } from "@/lib/commerce/policy";
import { assertCommerceEnvironment, sameOrigin } from "@/lib/commerce/runtime";
import {
  catalog,
  checkout,
  deleteAddress,
  getAddresses,
  getCart,
  listOrders,
  mergeCart,
  ownedOrder,
  quote,
  saveAddress,
  updateCart,
  cancelOrder,
} from "@/lib/server/commerce/store";
import {
  exchangeRecovery,
  guestShopper,
  identity,
  recoveryOrder,
} from "@/lib/server/commerce/identity";
import { beginPayment, payMock } from "@/lib/server/commerce/payments";
import { getDatabase } from "@/lib/server/database";
import { egyptianMobileSchema, manualEvidenceEnabled } from "@/lib/commerce/factory-policy";
import { getPolicy, transaction } from "@/lib/server/commerce/store";
export const dynamic = "force-dynamic";
const input = z
  .object({
    action: z.enum([
      "cart",
      "merge",
      "address",
      "deleteAddress",
      "profile",
      "quote",
      "checkout",
      "pay",
      "claim",
      "cancel",
      "recover",
    ]),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(0).max(99).optional(),
    id: z.string().uuid().optional(),
    address: addressSchema.optional(),
    rateId: z.string().uuid().optional(),
    method: z.enum(methods).optional(),
    locale: z.enum(["ar", "en"]).default("ar"),
    quoteHash: z.string().length(64).optional(),
    requestKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
    purpose: z.enum(["INITIAL", "BALANCE"]).default("INITIAL"),
    reference: z.string().max(96).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    phone: egyptianMobileSchema.optional(),
    token: z.string().length(64).optional(),
  })
  .strict();
function response(data: unknown, status = 200, setCookie?: string) {
  return Response.json(jsonValue(data), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
    },
  });
}
function failure(error: unknown) {
  if (error instanceof CommerceError) return response({ error: error.code }, error.status);
  if (error instanceof z.ZodError) return response({ error: "INVALID_INPUT" }, 400);
  console.error("Commerce request failed (details suppressed).");
  return response({ error: "REQUEST_FAILED" }, 500);
}
export async function GET(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    assertCommerceEnvironment();
    const url = new URL(request.url),
      resource = url.searchParams.get("resource");
    if (resource === "catalog") return response(await catalog());
    if (resource === "paymentOptions") {
      const { policy } = await transaction((tx) => getPolicy(tx));
      return response({
        COD: true,
        MOCK_CARD: process.env.P3_MOCK_PAYMENTS === "1",
        WALLET: !manualEvidenceEnabled() || Boolean(policy.manualInstructions?.WALLET?.enabled),
        INSTAPAY: !manualEvidenceEnabled() || Boolean(policy.manualInstructions?.INSTAPAY?.enabled),
      });
    }
    if (resource === "rates")
      return response(
        await getDatabase().shippingRate.findMany({ where: { enabled: true, country: "EG" } }),
      );
    const id = url.searchParams.get("id");
    if (resource === "order" && id) {
      const recovered = await recoveryOrder(request.headers, id);
      if (recovered) return response(await ownedOrder(recovered, id));
    }
    const { shopper } = await identity(request.headers);
    if (resource === "cart") return response(await getCart(shopper));
    if (resource === "addresses") return response(await getAddresses(shopper));
    if (resource === "orders") return response(await listOrders(shopper));
    if (resource === "order" && id) return response(await ownedOrder(shopper, id));
    if (resource === "profile") {
      demand(shopper.userId, "LOGIN_REQUIRED", 401);
      return response(
        await getDatabase().customerUser.findUnique({
          where: { id: shopper.userId },
          select: { name: true, email: true, phone: true, locale: true },
        }),
      );
    }
    return response({ error: "NOT_FOUND" }, 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    assertCommerceEnvironment();
    sameOrigin(request.headers);
    const data = input.parse(await readJson(request));
    if (data.action === "recover") {
      demand(data.token, "TOKEN_REQUIRED", 400);
      return response({ ok: true }, 200, await exchangeRecovery(data.token));
    }
    const { shopper, setCookie } = await identity(request.headers, data.action === "cart");
    let result: unknown;
    if (data.action === "cart") {
      demand(data.variantId && data.quantity !== undefined, "INVALID_INPUT", 400);
      result = await updateCart(shopper, data.variantId, data.quantity);
    } else if (data.action === "merge") {
      const guest = guestShopper(request.headers);
      demand(guest && shopper.userId, "LOGIN_REQUIRED", 401);
      result = await mergeCart(guest, shopper);
    } else if (data.action === "address")
      result = await saveAddress(shopper, data.address, data.id);
    else if (data.action === "deleteAddress") {
      demand(data.id, "ID_REQUIRED", 400);
      result = await deleteAddress(shopper, data.id);
    } else if (data.action === "profile") {
      demand(shopper.userId && data.name && data.phone, "LOGIN_REQUIRED", 401);
      result = await getDatabase().customerUser.update({
        where: { id: shopper.userId },
        data: { name: data.name, phone: data.phone, locale: data.locale },
        select: { name: true, phone: true, locale: true },
      });
    } else if (data.action === "quote" || data.action === "checkout") {
      demand(data.address && data.rateId && data.method, "CHECKOUT_INPUT_REQUIRED", 400);
      const v = {
        address: data.address,
        rateId: data.rateId,
        method: data.method,
        locale: data.locale,
        requestKey: data.requestKey,
        quoteHash: data.quoteHash,
      };
      result = data.action === "quote" ? await quote(shopper, v) : await checkout(shopper, v);
    } else {
      demand(data.id, "ORDER_ID_REQUIRED", 400);
      if (data.action === "cancel") result = await cancelOrder(shopper, data.id);
      else {
        demand(data.requestKey, "IDEMPOTENCY_KEY_REQUIRED", 400);
        result =
          data.action === "pay"
            ? await payMock(shopper, data.id, data.requestKey, data.purpose)
            : await beginPayment(shopper, data.id, data.requestKey, data.purpose, data.reference);
      }
    }
    if (data.action === "cart" || data.action === "merge") result = await getCart(shopper);
    if (data.action === "checkout" && result && typeof result === "object" && "id" in result)
      result = await ownedOrder(shopper, String(result.id));
    if (data.action === "cancel")
      result =
        result && typeof result === "object" && "reviewRequired" in result
          ? { reviewRequired: true }
          : await ownedOrder(shopper, data.id!);
    if (
      (data.action === "pay" || data.action === "claim") &&
      result &&
      typeof result === "object"
    ) {
      const p = result as {
        id: string;
        state: string;
        amountMinor: bigint;
        currency: string;
        purpose: string;
      };
      result = {
        id: p.id,
        state: p.state,
        amountMinor: p.amountMinor,
        currency: p.currency,
        purpose: p.purpose,
      };
    }
    return response(result, 200, setCookie);
  } catch (e) {
    return failure(e);
  }
}
