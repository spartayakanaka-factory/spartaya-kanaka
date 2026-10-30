import "server-only";
import { CommerceError, demand } from "@/lib/commerce/policy";
/** Bound bytes while reading, including chunked requests with no Content-Length. */
export async function readBody(request: Request, maximum = 20000) {
  return (await readBytes(request, maximum)).toString("utf8");
}
export async function readBytes(request: Request, maximum: number) {
  const length = request.headers.get("content-length");
  if (length !== null)
    demand(/^\d+$/.test(length) && Number(length) <= maximum, "INPUT_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new CommerceError("INPUT_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  try {
    return JSON.parse(await readBody(request));
  } catch (error) {
    if (error instanceof SyntaxError) throw new CommerceError("INVALID_INPUT", 400);
    throw error;
  }
}
