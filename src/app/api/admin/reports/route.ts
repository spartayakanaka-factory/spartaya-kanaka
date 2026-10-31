import { getStagingAccessResponse } from "@/lib/staging-access";
import { getAdminActor } from "@/lib/server/admin-session";
import { ownerReport } from "@/lib/server/commerce/reports";
import { allowReportRequest } from "@/lib/server/commerce/report-rate";
import { reportAuthGuard, reportDatabaseGuard } from "@/lib/server/commerce/report-auth-guard";
import { CommerceError } from "@/lib/commerce/policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  try {
    const auth = await reportAuthGuard(getAdminActor);
    if (!auth.ok)
      return Response.json(
        { error: "REPORT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    const actor = auth.value;
    if (!actor || actor.forcePasswordChange || actor.roleCode !== "OWNER")
      return Response.json(
        { error: "FORBIDDEN" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    const rate = await reportDatabaseGuard(() => allowReportRequest(actor.id));
    if (!rate.ok)
      return Response.json(
        { error: "REPORT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    if (!rate.value)
      return Response.json(
        { error: "RATE_LIMITED" },
        { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" } },
      );
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((k) => !["start", "end"].includes(k)) ||
      params.getAll("start").length !== 1 ||
      params.getAll("end").length !== 1
    )
      return Response.json(
        { error: "INVALID_INPUT" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const result = await reportDatabaseGuard(() =>
      ownerReport(actor.id, params.get("start")!, params.get("end")!),
    );
    if (!result.ok)
      return Response.json(
        { error: "REPORT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    return Response.json(result.value, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch (e) {
    const status =
      e instanceof CommerceError
        ? e.status
        : e instanceof Error && ["INVALID_DATE", "INVALID_RANGE"].includes(e.message)
          ? 400
          : 500;
    return Response.json(
      { error: status === 400 ? "INVALID_INPUT" : "REPORT_UNAVAILABLE" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
