import { readBody } from "@/lib/server/commerce/http";
import { getStagingAccessResponse } from "@/lib/staging-access";
import { receiveMockEvent } from "@/lib/server/commerce/payments";
import { CommerceError, jsonValue } from "@/lib/commerce/policy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const blocked = getStagingAccessResponse(request.headers);
    if (blocked) return blocked;
    const result = await receiveMockEvent(
      await readBody(request, 10000),
      request.headers.get("x-local-mock-signature") || "",
    );
    return Response.json(jsonValue(result), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof CommerceError ? e.code : "INVALID_EVENT" },
      { status: e instanceof CommerceError ? e.status : 400 },
    );
  }
}
