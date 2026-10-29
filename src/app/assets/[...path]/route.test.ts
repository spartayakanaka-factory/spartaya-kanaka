import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let temporaryDirectory: string;
const username = "stage-reviewer";
const password = "test-password-with-at-least-24-characters";
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "codex-assets-"));
  const root = path.join(temporaryDirectory, "media");
  await mkdir(path.join(root, "المنتجات"), { recursive: true });
  await writeFile(path.join(root, "المنتجات", "sample.jpg"), new Uint8Array([1, 2, 3]));
  await writeFile(path.join(temporaryDirectory, "outside.jpg"), "outside");
  vi.stubEnv("LEGACY_ASSET_ROOT", root);
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("STAGING_SITE", "1");
  vi.stubEnv("STAGING_ACCESS_USERNAME", username);
  vi.stubEnv("STAGING_ACCESS_PASSWORD", password);
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

async function request(
  segments: string[],
  authenticated = true,
  host = "bisque-pheasant-330767.hostingersite.com",
) {
  const { GET } = await import("./route");
  return GET(
    new Request(`https://${host}/assets/image`, {
      headers: { host, ...(authenticated ? { authorization } : {}) },
    }),
    { params: Promise.resolve({ path: segments }) },
  );
}

describe("persistent catalog assets", () => {
  it("serves the configured media root with private staging cache headers", async () => {
    const response = await request(["المنتجات", "sample.jpg"]);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("denies anonymous access before returning an existing image", async () => {
    const response = await request(["المنتجات", "sample.jpg"], false);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  it("rejects traversal beyond the configured root", async () => {
    expect((await request(["المنتجات", "..", "..", "outside.jpg"])).status).toBe(404);
  });

  it("retains immutable image caching when staging protection is disabled", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("STAGING_SITE", "0");
    const response = await request(["المنتجات", "sample.jpg"], false, "store.example.com");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });
});
