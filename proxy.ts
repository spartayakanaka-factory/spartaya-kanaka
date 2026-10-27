import { NextResponse, type NextRequest } from "next/server";
import { getStagingAccessConfig, isAuthorizedStagingBasicAuth } from "@/lib/staging-access";

const stagingHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function proxy(request: NextRequest) {
  const config = getStagingAccessConfig();
  if (config.mode === "disabled") return NextResponse.next();

  if (config.mode === "misconfigured") {
    return new NextResponse("Staging access is not configured.", {
      status: 503,
      headers: stagingHeaders,
    });
  }

  if (!isAuthorizedStagingBasicAuth(request.headers.get("authorization"))) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        ...stagingHeaders,
        "WWW-Authenticate": 'Basic realm="Sprtaya Phase 2 Staging", charset="UTF-8"',
      },
    });
  }

  const response = NextResponse.next();
  for (const [name, value] of Object.entries(stagingHeaders)) response.headers.set(name, value);
  return response;
}

export const config = { matcher: "/:path*" };
