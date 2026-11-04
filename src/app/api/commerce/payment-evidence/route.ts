import { z } from "zod";
import { CommerceError, demand, jsonValue } from "@/lib/commerce/policy";
import { assertCommerceEnvironment, sameOrigin } from "@/lib/commerce/runtime";
import { getStagingAccessResponse } from "@/lib/staging-access";
import { identity, recoveryOrder } from "@/lib/server/commerce/identity";
import { getAdminActor } from "@/lib/server/admin-session";
import { getDatabase } from "@/lib/server/database";
import { readBytes } from "@/lib/server/commerce/http";
import {
  evidenceBytes,
  evidenceList,
  uploadEvidence,
  type EvidenceViewer,
} from "@/lib/server/commerce/evidence";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
async function viewer(request: Request, paymentId?: string): Promise<EvidenceViewer> {
  const u = new URL(request.url);
  if (u.searchParams.get("audience") === "staff") {
    const actor = await getAdminActor();
    demand(actor, "FORBIDDEN", 403);
    return { key: "staff:" + actor.id, adminId: actor.id };
  }
  if (paymentId) {
    const p = await getDatabase().commercePayment.findUnique({
      where: { id: paymentId },
      select: { orderId: true },
    });
    if (p) {
      const recovered = await recoveryOrder(request.headers, p.orderId);
      if (recovered) return recovered;
    }
  }
  return (await identity(request.headers)).shopper;
}
function failed(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof CommerceError
          ? e.code
          : e instanceof z.ZodError
            ? "INVALID_INPUT"
            : "EVIDENCE_UNAVAILABLE",
    },
    {
      status: e instanceof CommerceError ? e.status : e instanceof z.ZodError ? 400 : 503,
      headers,
    },
  );
}
export async function GET(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    assertCommerceEnvironment();
    const u = new URL(request.url),
      file = u.searchParams.get("file");
    if (file) {
      z.string().uuid().parse(file);
      const proof = await getDatabase().commercePaymentEvidence.findUnique({
        where: { id: file },
        select: { paymentId: true },
      });
      demand(proof, "PAYMENT_NOT_FOUND", 404);
      const bytes = await evidenceBytes(
        await viewer(request, proof.paymentId),
        file,
        u.searchParams.get("expires") || "",
        u.searchParams.get("signature") || "",
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          ...headers,
          "Content-Type": "image/webp",
          "Content-Disposition": 'inline; filename="' + file + '.webp"',
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    const id = z.string().uuid().parse(u.searchParams.get("paymentId"));
    return Response.json(jsonValue(await evidenceList(await viewer(request, id), id)), { headers });
  } catch (e) {
    return failed(e);
  }
}
export async function POST(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    assertCommerceEnvironment();
    sameOrigin(request.headers);
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("paymentId"));
    const actor = await viewer(request, id);
    demand(!actor.adminId, "FORBIDDEN", 403);
    const result = await uploadEvidence(
      actor,
      id,
      request.headers.get("Idempotency-Key") || "",
      await readBytes(request, 5 * 1024 * 1024),
      request.headers.get("Content-Type") || "",
      request.headers.get("X-Transfer-Reference") || undefined,
    );
    return Response.json(result, { headers });
  } catch (e) {
    return failed(e);
  }
}
