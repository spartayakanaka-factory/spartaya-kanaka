import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getStoreProducts, getStoreCategories } from "@/lib/server/storefront-catalog";
import { site } from "@/lib/site-config";
import { commerceEnabled } from "@/lib/commerce/runtime";
import { getStagingAccessConfig, getStagingRequestHostname } from "@/lib/staging-access";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hostname = getStagingRequestHostname(await headers());
  if (getStagingAccessConfig(process.env, hostname).mode !== "disabled" || commerceEnabled()) {
    return [];
  }
  const [products, categories] = await Promise.all([getStoreProducts(), getStoreCategories()]);
  const root = site.siteUrl;
  const locales = ["ar", "en"];
  const staticPaths = [
    "",
    "/collections",
    "/products",
    "/about",
    "/wholesale",
    "/custom-orders",
    "/contact",
    "/policies",
  ];
  const urls: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const route of staticPaths) {
      urls.push({
        url: root + "/" + locale + route,
        changeFrequency: route === "" ? "weekly" : "monthly",
        priority: route === "" ? 1 : 0.7,
      });
    }
    for (const category of categories) {
      urls.push({
        url: root + "/" + locale + "/collections/" + category.id,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
    for (const product of products) {
      urls.push({
        url: root + "/" + locale + "/products/" + product.slug,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }
  return urls;
}
