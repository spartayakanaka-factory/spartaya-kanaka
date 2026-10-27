import type { CatalogImage } from "@/lib/types";

// Shared with the gallery without importing the server's complete catalog.
export function getProductImageUrl(image: Pick<CatalogImage, "localPath" | "publicUrl">): string {
  if (image.publicUrl?.startsWith("https://")) return image.publicUrl;
  if (!image.localPath) return "/assets/unavailable.jpg";
  return "/assets/" + image.localPath.split("/").map(encodeURIComponent).join("/");
}
