import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { GET as storefrontGet, POST as storefrontPost } from "@/app/api/commerce/route";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/commerce/route";
import { GET as authGet, POST as authPost } from "@/app/api/customer-auth/[...all]/route";
import { POST as webhookPost } from "@/app/api/mock-payments/webhook/route";
import { readBody } from "./http";
afterEach(() => vi.unstubAllEnvs());
describe("New API defenses independent of Next Proxy execution", () => {
  it("rejects anonymous and invalid staging auth on every new handler before runtime/database access", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_SITE", "1");
    vi.stubEnv("STAGING_ACCESS_USERNAME", "audit");
    vi.stubEnv("STAGING_ACCESS_PASSWORD", randomUUID());
    for (const handler of [
      storefrontGet,
      storefrontPost,
      adminGet,
      adminPost,
      authGet,
      authPost,
      webhookPost,
    ])
      for (const authorization of ["", "Basic YWJjOmRlZg=="]) {
        const r = await handler(
          new Request("https://bisque-pheasant-330767.hostingersite.com/api/commerce", {
            headers: { host: "bisque-pheasant-330767.hostingersite.com", authorization },
          }),
        );
        expect(r.status).toBe(401);
        expect(r.headers.get("x-robots-tag")).toContain("noindex");
      }
  });
  it("rejects a chunked oversized body without trusting Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(15000));
        c.enqueue(new Uint8Array(15000));
        c.close();
      },
    });
    const request = new Request("http://localhost:3003/api/commerce", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readBody(request)).rejects.toThrow("INPUT_TOO_LARGE");
  });
  it("counts UTF-8 bytes rather than characters", async () => {
    await expect(
      readBody(new Request("http://localhost:3003", { method: "POST", body: "ن".repeat(11000) })),
    ).rejects.toThrow("INPUT_TOO_LARGE");
  });
});
