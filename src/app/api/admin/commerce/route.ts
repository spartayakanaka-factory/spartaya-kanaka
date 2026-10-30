import { readJson } from "@/lib/server/commerce/http";
import { getStagingAccessResponse } from "@/lib/staging-access";
import { z } from "zod";
import { getAdminActor } from "@/lib/server/admin-session";
import { getDatabase } from "@/lib/server/database";
import { demand, CommerceError, jsonValue, policySchema } from "@/lib/commerce/policy";
import { sameOrigin, assertCommerceEnvironment } from "@/lib/commerce/runtime";
import {
  financeTransition,
  fulfill,
  requestFinance,
  staff,
  reviewCancellation,
} from "@/lib/server/commerce/admin";
import { drainNotifications } from "@/lib/server/commerce/notifications";
import { expireOrders } from "@/lib/server/commerce/store";
export const dynamic = "force-dynamic";
async function actor() {
  assertCommerceEnvironment();
  const a = await getAdminActor();
  demand(a, "FORBIDDEN", 403);
  return staff(a.id);
}
function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof CommerceError
          ? e.code
          : e instanceof z.ZodError
            ? "INVALID_INPUT"
            : "REQUEST_FAILED",
    },
    {
      status: e instanceof CommerceError ? e.status : e instanceof z.ZodError ? 400 : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export async function GET(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    const viewer = await actor();
    const u = new URL(request.url),
      db = getDatabase(),
      id = u.searchParams.get("id");
    if (id) {
      const order = await db.commerceOrder.findUnique({
        where: { id },
        include: { items: true, payments: true, events: { orderBy: { createdAt: "asc" } } },
      });
      demand(order, "NOT_FOUND", 404);
      return Response.json(
        jsonValue({
          ...order,
          shipment: await db.commerceShipment.findUnique({ where: { orderId: id } }),
          reviewPending:
            order.payments.some((p) => p.state === "REVIEW_REQUIRED") ||
            order.refundedMinor > BigInt(0) ||
            (await db.commerceCancellation.count({ where: { orderId: id, state: "REQUESTED" } })) >
              0 ||
            (await db.commerceFinanceRequest.count({
              where: {
                orderId: id,
                kind: "REFUND",
                state: { in: ["REQUESTED", "APPROVED", "EXECUTED", "UNKNOWN"] },
              },
            })) > 0,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const state = u.searchParams.get("state"),
      q = u.searchParams.get("q") || "";
    return Response.json(
      jsonValue({
        viewerId: viewer.id,
        financeGrants: await db.commerceFinanceGrant.findMany({
          where: viewer.roleCode === "OWNER" ? {} : { adminId: viewer.id },
        }),
        staff:
          viewer.roleCode === "OWNER"
            ? await db.adminUser.findMany({
                where: { roleCode: { in: ["OWNER", "MANAGER"] }, banned: false },
                select: { id: true, name: true, roleCode: true },
              })
            : [],
        orders: await db.commerceOrder.findMany({
          where: { ...(state ? { state } : {}), ...(q ? { id: { startsWith: q } } : {}) },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        cancellations: await db.commerceCancellation.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        finance: await db.commerceFinanceRequest.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        policy: await db.commercePolicy.findUnique({ where: { id: "local-synthetic" } }),
        rates: await db.shippingRate.findMany(),
        notifications: await db.commerceNotification.findMany({
          select: {
            id: true,
            kind: true,
            locale: true,
            state: true,
            attempts: true,
            createdAt: true,
          },
          take: 50,
          orderBy: { createdAt: "desc" },
        }),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    adminId: z.string().min(1).max(191),
    operation: z.enum([
      "PAYMENT_VERIFY",
      "REFUND_REQUEST",
      "REFUND_APPROVE",
      "REFUND_EXECUTE",
      "RECONCILE",
    ]),
    limitMinor: z.string().regex(/^[1-9][0-9]{0,6}$/),
    days: z.number().int().min(1).max(30),
    revoked: z.boolean(),
    reason: z.string().min(8).max(500),
  }),
  z.object({ action: z.literal("cancellation"), id: z.string().uuid(), approve: z.boolean() }),
  z.object({
    action: z.literal("financeRequest"),
    orderId: z.string().uuid(),
    kind: z.enum(["REFUND", "VERIFY_TRANSFER"]),
    amount: z.string().regex(/^\d+$/),
    paymentId: z.string().uuid().optional(),
    key: z.string().min(8).max(64),
    reason: z.string().min(8).max(500),
  }),
  z.object({
    action: z.literal("financeTransition"),
    id: z.string().uuid(),
    transition: z.enum(["approve", "execute", "reconcile", "reject"]),
  }),
  z.object({
    action: z.literal("fulfill"),
    orderId: z.string().uuid(),
    transition: z.enum([
      "start",
      "ready",
      "dispatch",
      "delivered",
      "failed",
      "returned",
      "cod_collected",
      "cod_reconciled",
    ]),
    reference: z.string().max(191).optional(),
  }),
  z.object({ action: z.literal("jobs") }),
  z.object({
    action: z.literal("policy"),
    version: z.number().int().min(1),
    configuration: policySchema,
  }),
  z.object({
    action: z.literal("rate"),
    id: z.string().uuid().optional(),
    country: z.literal("EG"),
    region: z.string().min(1).max(96),
    carrier: z.string().min(1).max(96),
    feeMinor: z.string().regex(/^\d{1,12}$/),
    currency: z.literal("EGP"),
    enabled: z.boolean(),
    leadDays: z.number().int().min(1).max(365),
    codEnabled: z.boolean(),
    codFeeMinor: z
      .string()
      .regex(/^\d{1,12}$/)
      .nullable(),
    codMaximumMinor: z
      .string()
      .regex(/^\d{1,12}$/)
      .nullable(),
  }),
]);
export async function POST(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    sameOrigin(request.headers);
    const a = await actor();
    const data = schema.parse(await readJson(request));
    let result: unknown;
    if (data.action === "cancellation")
      result = await reviewCancellation(a.id, data.id, data.approve);
    else if (data.action === "financeRequest") result = await requestFinance(a.id, data);
    else if (data.action === "financeTransition")
      result = await financeTransition(a.id, data.id, data.transition);
    else if (data.action === "fulfill")
      result = await fulfill(a.id, data.orderId, data.transition, data.reference);
    else if (data.action === "jobs")
      result = { expired: await expireOrders(), captured: await drainNotifications() };
    else {
      demand(a.roleCode === "OWNER", "OWNER_REQUIRED", 403);
      const db = getDatabase();
      if (data.action === "grant") {
        const target = await db.adminUser.findUnique({ where: { id: data.adminId } });
        demand(
          target && ["OWNER", "MANAGER"].includes(target.roleCode) && !target.banned,
          "INVALID_DELEGATE",
          400,
        );
        demand(BigInt(data.limitMinor) <= BigInt(1000000), "SYNTHETIC_LIMIT_EXCEEDED", 400);
        result = await db.$transaction(async (tx) => {
          const current = await staff(a.id, tx);
          demand(current.roleCode === "OWNER", "OWNER_REQUIRED", 403);
          const row = await tx.commerceFinanceGrant.upsert({
            where: {
              adminId_operation_currency: {
                adminId: data.adminId,
                operation: data.operation,
                currency: "EGP",
              },
            },
            create: {
              adminId: data.adminId,
              operation: data.operation,
              currency: "EGP",
              limitMinor: BigInt(data.limitMinor),
              expiresAt: new Date(Date.now() + data.days * 86400000),
              revoked: data.revoked,
            },
            update: {
              limitMinor: BigInt(data.limitMinor),
              expiresAt: new Date(Date.now() + data.days * 86400000),
              revoked: data.revoked,
            },
          });
          await tx.commerceEvent.create({
            data: {
              actorKey: "staff:" + a.id,
              kind: "finance.grant_changed",
              operationKey: "grant:" + crypto.randomUUID(),
              data: {
                adminId: data.adminId,
                operation: data.operation,
                limitMinor: data.limitMinor,
                days: data.days,
                revoked: data.revoked,
                reason: data.reason,
              },
            },
          });
          return row;
        });
      } else if (data.action === "policy") {
        result = await db.$transaction(async (tx) => {
          const current = await staff(a.id, tx);
          demand(current.roleCode === "OWNER", "OWNER_REQUIRED", 403);
          const changed = await tx.commercePolicy.updateMany({
            where: { id: "local-synthetic", version: data.version },
            data: { configuration: data.configuration, version: { increment: 1 } },
          });
          demand(changed.count === 1, "SETTINGS_CONFLICT");
          await tx.commerceEvent.create({
            data: {
              actorKey: "staff:" + a.id,
              kind: "policy.updated",
              operationKey: "policy:" + data.version,
              data: { configuration: data.configuration },
            },
          });
          return changed;
        });
      } else {
        const { action: _action, id, ...values } = data;
        void _action;
        demand(
          !values.codEnabled || (values.codFeeMinor !== null && values.codMaximumMinor !== null),
          "COD_CONFIGURATION_REQUIRED",
        );
        const value = {
          ...values,
          feeMinor: BigInt(values.feeMinor),
          codFeeMinor: values.codFeeMinor === null ? null : BigInt(values.codFeeMinor),
          codMaximumMinor: values.codMaximumMinor === null ? null : BigInt(values.codMaximumMinor),
        };
        result = await db.$transaction(async (tx) => {
          const current = await staff(a.id, tx);
          demand(current.roleCode === "OWNER", "OWNER_REQUIRED", 403);
          const row = id
            ? await tx.shippingRate.update({
                where: { id },
                data: { ...value, version: { increment: 1 } },
              })
            : await tx.shippingRate.create({ data: value });
          await tx.commerceEvent.create({
            data: {
              actorKey: "staff:" + a.id,
              kind: "shipping.updated",
              operationKey: "rate:" + row.id + ":" + row.version,
              data: jsonValue(row),
            },
          });
          return row;
        });
      }
    }
    return Response.json(jsonValue(result), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
