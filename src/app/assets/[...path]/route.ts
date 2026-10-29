import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getStagingAccessDecision, getStagingAccessResponse } from "@/lib/staging-access";

const assetRoot = path.resolve(
  process.env.LEGACY_ASSET_ROOT || path.join(process.cwd(), "sprtaya-kanaka-assets"),
);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const mimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  const { path: segments } = await context.params;
  const relativePath = segments.join("/");
  const resolved = path.resolve(assetRoot, relativePath);
  const withinAssetRoot = resolved.startsWith(assetRoot + path.sep);
  const allowedFolder =
    relativePath.startsWith("المنتجات/") || relativePath.startsWith("الهوية البصرية/");
  const extension = path.extname(resolved).toLowerCase();
  if (!withinAssetRoot || !allowedFolder || !allowedExtensions.has(extension)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const image = await readFile(resolved);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": mimeTypes[extension],
        "Cache-Control":
          getStagingAccessDecision(request.headers).mode === "disabled"
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
