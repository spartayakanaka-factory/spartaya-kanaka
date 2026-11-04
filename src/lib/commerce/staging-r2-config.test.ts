import { describe, expect, it } from "vitest";
import { stagingR2ConfigIssues } from "./staging-r2-config";

const account = "a".repeat(32);
const valid = {
  STAGING_R2_ACCOUNT_ID: account,
  MEDIA_S3_ENDPOINT: `https://${account}.r2.cloudflarestorage.com`,
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ORIGINALS_BUCKET: "sprtaya-staging-private",
  MEDIA_S3_DISPLAY_BUCKET: "sprtaya-staging-public",
  MEDIA_ACCESS_KEY_ID: "synthetic-key",
  MEDIA_SECRET_ACCESS_KEY: "synthetic-secret",
  MEDIA_PUBLIC_BASE_URL: "https://bisque-pheasant-330767.hostingersite.com/api/staging-media",
  MEDIA_S3_FORCE_PATH_STYLE: "true",
};

describe("reviewed staging R2 configuration", () => {
  it("accepts the required shape without claiming remote verification", () => {
    expect(stagingR2ConfigIssues(valid)).toEqual([]);
  });
  it.each([
    ["STAGING_R2_ACCOUNT_ID", "bad"],
    ["MEDIA_S3_ENDPOINT", "https://production.invalid"],
    ["MEDIA_S3_ENDPOINT", `https://${account}.r2.cloudflarestorage.com.evil.invalid`],
    ["MEDIA_S3_ORIGINALS_BUCKET", "sprtaya-production"],
    ["MEDIA_S3_DISPLAY_BUCKET", "sprtaya-staging-private"],
    ["MEDIA_ACCESS_KEY_ID", ""],
    ["MEDIA_SECRET_ACCESS_KEY", ""],
    ["MEDIA_PUBLIC_BASE_URL", "https://production.invalid"],
    ["MEDIA_S3_REGION", "us-east-1"],
    ["MEDIA_S3_FORCE_PATH_STYLE", "maybe"],
  ])("rejects an unsafe %s", (key, value) => {
    expect(stagingR2ConfigIssues({ ...valid, [key]: value })).toContain(key);
  });
});
