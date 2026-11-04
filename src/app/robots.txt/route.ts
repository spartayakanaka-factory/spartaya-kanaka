import {
  getStagingAccessConfig,
  getStagingAccessResponse,
  getStagingRequestHostname,
} from "@/lib/staging-access";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { site } from "@/lib/site-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;

  const hostname = getStagingRequestHostname(request.headers);
  const isStaging = getStagingAccessConfig(process.env, hostname).mode !== "disabled" || commerceEnabled();
  const body = isStaging
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\n\nSitemap: ${site.siteUrl}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      "Cache-Control": isStaging ? "private, no-store" : "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
      ...(isStaging ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {}),
    },
  });
}
