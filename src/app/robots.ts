import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { site } from "@/lib/site-config";
import { getStagingAccessConfig } from "@/lib/staging-access";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = (await headers()).get("host")?.split(":", 1)[0];
  if (getStagingAccessConfig(process.env, hostname).mode !== "disabled") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return { rules: { userAgent: "*", allow: "/" }, sitemap: site.siteUrl + "/sitemap.xml" };
}
