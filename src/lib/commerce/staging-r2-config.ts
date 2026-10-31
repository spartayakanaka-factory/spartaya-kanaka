/** Configuration review only: this does not establish bucket ownership or enable commerce. */
export function stagingR2ConfigIssues(env: Record<string, string | undefined>): string[] {
  const issues: string[] = [];
  const account = env.STAGING_R2_ACCOUNT_ID || "";
  if (!/^[a-f0-9]{32}$/.test(account)) issues.push("STAGING_R2_ACCOUNT_ID");
  if (!account || env.MEDIA_S3_ENDPOINT !== `https://${account}.r2.cloudflarestorage.com`)
    issues.push("MEDIA_S3_ENDPOINT");
  if (env.MEDIA_S3_REGION !== "auto") issues.push("MEDIA_S3_REGION");
  if (env.MEDIA_S3_ORIGINALS_BUCKET !== "sprtaya-staging-private")
    issues.push("MEDIA_S3_ORIGINALS_BUCKET");
  if (env.MEDIA_S3_DISPLAY_BUCKET !== "sprtaya-staging-display")
    issues.push("MEDIA_S3_DISPLAY_BUCKET");
  if (!env.MEDIA_ACCESS_KEY_ID) issues.push("MEDIA_ACCESS_KEY_ID");
  if (!env.MEDIA_SECRET_ACCESS_KEY) issues.push("MEDIA_SECRET_ACCESS_KEY");
  if (!/^https:\/\/pub-[a-f0-9]{32}\.r2\.dev$/.test(env.MEDIA_PUBLIC_BASE_URL || ""))
    issues.push("MEDIA_PUBLIC_BASE_URL");
  if (!["true", "false"].includes(env.MEDIA_S3_FORCE_PATH_STYLE || ""))
    issues.push("MEDIA_S3_FORCE_PATH_STYLE");
  return issues;
}
