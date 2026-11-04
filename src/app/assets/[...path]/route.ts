import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getStagingAccessDecision, getStagingAccessResponse } from "@/lib/staging-access";
import { imageContentType } from "@/lib/image-content-type";

const assetRoot = path.resolve(
  process.env.LEGACY_ASSET_ROOT || path.join(process.cwd(), "sprtaya-kanaka-assets"),
);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

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
    const [canonicalRoot, canonicalFile] = await Promise.all([
      realpath(assetRoot),
      realpath(resolved),
    ]);
    if (!canonicalFile.startsWith(canonicalRoot + path.sep))
      return new NextResponse("Not found", { status: 404 });
    const image = await readFile(canonicalFile);
    const contentType = imageContentType(image);
    if (!contentType) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": contentType,
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
