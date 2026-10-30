import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getDatabase } from "../database";
import { assertCommerceEnvironment, requireFeature } from "@/lib/commerce/runtime";
import { demand } from "@/lib/commerce/policy";
import { capturePrivate } from "./notifications";
function buildCustomerAuth() {
  assertCommerceEnvironment();
  requireFeature("CUSTOMER_ACCOUNTS");
  demand((process.env.CUSTOMER_AUTH_SECRET?.length || 0) >= 32, "CUSTOMER_SECRET_REQUIRED", 503);
  return betterAuth({
    appName: "Sprtaya & Kanaka Customer — Local Simulation",
    baseURL: process.env.CUSTOMER_AUTH_URL!,
    basePath: "/api/customer-auth",
    secret: process.env.CUSTOMER_AUTH_SECRET!,
    trustedOrigins: [process.env.CUSTOMER_AUTH_URL!],
    database: prismaAdapter(getDatabase(), { provider: "mysql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await capturePrivate("password-reset", user.email, { url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await capturePrivate("verify-email", user.email, { url });
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await getDatabase().customerUser.findUnique({
              where: { id: session.userId },
              select: { banned: true },
            });
            return user && !user.banned ? { data: session } : false;
          },
        },
      },
      user: {
        create: {
          before: async (user) => {
            demand(user.email.endsWith(".invalid"), "SYNTHETIC_CONTACT_REQUIRED", 400);
            return { data: user };
          },
        },
      },
    },
    user: {
      modelName: "CustomerUser",
      additionalFields: {
        banned: { type: "boolean", input: false, returned: false, defaultValue: false },
      },
    },
    session: { modelName: "CustomerSession", expiresIn: 86400, updateAge: 3600 },
    account: { modelName: "CustomerAccount" },
    verification: { modelName: "CustomerVerification" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "CustomerRateLimit",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    advanced: {
      cookiePrefix: "sprtaya-customer",
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    },
  });
}
let instance: ReturnType<typeof buildCustomerAuth> | undefined;
export function getCustomerAuth() {
  assertCommerceEnvironment();
  requireFeature("CUSTOMER_ACCOUNTS");
  return (instance ??= buildCustomerAuth());
}
export async function customerIdentity(headers: Headers) {
  if (process.env.P3_CUSTOMER_ACCOUNTS !== "1") return null;
  assertCommerceEnvironment();
  requireFeature("CUSTOMER_ACCOUNTS");
  const session = await getCustomerAuth().api.getSession({ headers });
  if (session) {
    const current = await getDatabase().customerUser.findUnique({
      where: { id: session.user.id },
      select: { banned: true, emailVerified: true },
    });
    demand(current && !current.banned && current.emailVerified, "CUSTOMER_ACCESS_DENIED", 403);
  }
  return session ? { key: "customer:" + session.user.id, user: session.user } : null;
}
