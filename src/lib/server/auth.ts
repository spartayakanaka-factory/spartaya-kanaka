import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getDatabase } from "@/lib/server/database";

const production = process.env.NODE_ENV === "production";

function requiredSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function buildAuth() {
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error("BETTER_AUTH_URL is not configured.");
  const trustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? baseURL)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return betterAuth({
    appName: "Sprtaya & Kanaka Admin",
    baseURL,
    secret: requiredSecret(),
    trustedOrigins,
    database: prismaAdapter(getDatabase(), { provider: "mysql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      modelName: "AdminUser",
      additionalFields: {
        roleCode: { type: "string", required: false, input: false, defaultValue: "INVENTORY_STAFF" },
        forcePasswordChange: {
          type: "boolean",
          required: false,
          input: false,
          defaultValue: true,
        },
      },
    },
    session: {
      modelName: "AuthSession",
      expiresIn: 8 * 60 * 60,
      updateAge: 60 * 60,
    },
    account: { modelName: "AuthAccount" },
    verification: { modelName: "AuthVerification" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "AuthRateLimit",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: production,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
      },
    },
  });
}

type AuthInstance = ReturnType<typeof buildAuth>;
let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  authInstance ??= buildAuth();
  return authInstance;
}
