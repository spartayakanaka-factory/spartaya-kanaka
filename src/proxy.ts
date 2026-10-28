import { NextResponse, type NextRequest } from "next/server";
import { getStagingAccessDecision, getStagingAccessResponse } from "@/lib/staging-access";

export function proxy(request: NextRequest) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;

  const response = NextResponse.next();
  if (getStagingAccessDecision(request.headers).mode !== "disabled") {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export const config = { matcher: "/:path*" };
