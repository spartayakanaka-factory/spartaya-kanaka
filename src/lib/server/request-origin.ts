import "server-only";

export function hasTrustedRequestOrigin(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;
  let origin: string;
  try {
    const parsed = new URL(originHeader);
    if (parsed.origin !== originHeader.replace(/\/$/, "")) return false;
    origin = parsed.origin;
  } catch { return false; }
  const configured = process.env.AUTH_TRUSTED_ORIGINS ?? process.env.BETTER_AUTH_URL ?? "";
  return configured.split(",").some((value) => {
    try { return new URL(value.trim()).origin === origin; } catch { return false; }
  });
}
