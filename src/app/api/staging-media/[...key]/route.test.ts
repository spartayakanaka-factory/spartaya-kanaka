import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), mediaEnabled: vi.fn(), destroy: vi.fn(), find: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/commerce/runtime", () => ({ commerceEnabled: mocks.enabled }));
vi.mock("@/lib/server/database", () => ({
  getDatabase: () => ({ mediaAsset: { findUnique: mocks.find } }),
}));
vi.mock("@/lib/server/media-storage", () => ({
  privateStagingMediaEnabled: mocks.mediaEnabled,
  getMediaStorage: () => ({ displayBucket: "private-display", client: { send: mocks.send, destroy: mocks.destroy } }),
}));
import { GET } from "./route";

const id = "38ac7f20-070f-48d2-b540-9904e3f21d02.webp";
const valid = { params: Promise.resolve({ key: ["product-displays", id] }) };
const pass = "synthetic-staging-password-long";
const req = (auth?: string) =>
  new Request(
    "https://bisque-pheasant-330767.hostingersite.com/api/staging-media/product-displays/" + id,
    {
      headers: {
        host: "bisque-pheasant-330767.hostingersite.com",
        ...(auth ? { authorization: auth } : {}),
      },
    },
  );
const auth = "Basic " + Buffer.from("synthetic:" + pass).toString("base64");
const stream = (bytes: number[]) => ({
  async *[Symbol.asyncIterator]() {
    yield Uint8Array.from(bytes);
  },
});

beforeEach(() => {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("STAGING_SITE", "1");
  vi.stubEnv("SR_HOSTED_ISOLATION", "1");
  vi.stubEnv("STAGING_ACCESS_USERNAME", "synthetic");
  vi.stubEnv("STAGING_ACCESS_PASSWORD", pass);
  mocks.enabled.mockReturnValue(true);
  mocks.mediaEnabled.mockReturnValue(false);
  mocks.find.mockResolvedValue({ provider: "S3_COMPATIBLE" });
  mocks.send.mockResolvedValue({
    ContentType: "image/webp",
    ContentLength: 3,
    Body: stream([1, 2, 3]),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("private staging image delivery", () => {
  it("rejects missing or incorrect staging credentials before database or storage access", async () => {
    expect((await GET(req(), valid)).status).toBe(401);
    expect(
      (await GET(req("Basic " + Buffer.from("bad:bad").toString("base64")), valid)).status,
    ).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("serves a registered display image only to authenticated staging viewers without caching", async () => {
    const res = await GET(req(auth), valid);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(mocks.find).toHaveBeenCalledWith({
      where: { displayKey: "product-displays/" + id },
      select: { provider: true },
    });
  });
  it("refuses evidence keys, unregistered objects, and inactive hosted configuration", async () => {
    expect(
      (await GET(req(auth), { params: Promise.resolve({ key: ["payment-evidence", id] }) })).status,
    ).toBe(404);
    mocks.find.mockResolvedValueOnce(null);
    expect((await GET(req(auth), valid)).status).toBe(404);
    mocks.enabled.mockReturnValueOnce(false);
    expect((await GET(req(auth), valid)).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("supports private media while commerce is disabled and distinguishes missing objects", async () => {
    mocks.enabled.mockReturnValue(false);
    mocks.mediaEnabled.mockReturnValue(true);
    const missing = new Error("object missing");
    missing.name = "NoSuchKey";
    mocks.send.mockRejectedValueOnce(missing);
    expect((await GET(req(auth), valid)).status).toBe(404);
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect((await GET(req(auth), valid)).status).toBe(200);
  });
  it("fails closed on wrong content type and oversized objects", async () => {
    mocks.send.mockResolvedValueOnce({ ContentType: "text/html", Body: stream([1]) });
    expect((await GET(req(auth), valid)).status).toBe(503);
    mocks.send.mockResolvedValueOnce({
      ContentType: "image/webp",
      ContentLength: 11 * 1024 * 1024,
      Body: stream([1]),
    });
    expect((await GET(req(auth), valid)).status).toBe(503);
  });
});
