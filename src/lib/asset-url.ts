import type { CatalogImage } from "@/lib/types";

// Shared with the gallery without importing the server's complete catalog.
export function getProductImageUrl(image: Pick<CatalogImage, "localPath" | "publicUrl">): string {
  if (image.publicUrl) {
    try {
      const url = new URL(image.publicUrl);
      if (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return image.publicUrl;
    } catch { /* Fall back to the preserved local archive. */ }
  }
  if (!image.localPath) return "/assets/unavailable.jpg";
  return "/assets/" + image.localPath.split("/").map(encodeURIComponent).join("/");
}
