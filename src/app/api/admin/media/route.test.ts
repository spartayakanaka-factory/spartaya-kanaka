import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  db: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/server/admin-session", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/server/database", () => ({ getDatabase: mocks.db }));
vi.mock("@/lib/staging-access", () => ({ getStagingAccessResponse: () => null }));
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.permission.mockResolvedValue({ id: "owner" });
  mocks.db.mockReturnValue({ mediaAsset: { count: mocks.count, findMany: mocks.findMany }, $transaction: (work: (tx: unknown) => unknown) => work({ $queryRaw: mocks.query }) });
  mocks.count.mockResolvedValue(400);
  const rows = [
    {
      id: "image",
      altAr: "نحاس",
      originalKey: "private-original-key",
      publicUrl: "https://display.invalid/product.webp",
    },
  ];
  mocks.findMany.mockResolvedValue(rows);
  mocks.query.mockResolvedValueOnce([{ count: BigInt(400) }]).mockResolvedValueOnce(rows);
});
describe("Authenticated complete product media library", () => {
  it("rejects unauthorized readers before database access", async () => {
    mocks.permission.mockRejectedValue(Error("FORBIDDEN"));
    expect((await GET(new Request("http://localhost/api/admin/media"))).status).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("returns bounded searched pages and display URLs without original storage keys", async () => {
    const r = await GET(new Request("http://localhost/api/admin/media?q=نحاس&page=7"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.json()).toMatchObject({
      total: 400,
      page: 7,
      assets: [{ id: "image", label: "نحاس", url: "https://display.invalid/product.webp" }],
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1].slice(-2)).toEqual([36, 252]);
  });
  it("rejects malformed pagination and handles database failure without leaking errors", async () => {
    for (const value of ["-1", "2.2", "NaN", "10001"])
      expect(
        (await GET(new Request("http://localhost/api/admin/media?page=" + value))).status,
      ).toBe(400);
    mocks.count.mockRejectedValue(Error("private database details"));
    const r = await GET(new Request("http://localhost/api/admin/media"));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private database");
  });
});
