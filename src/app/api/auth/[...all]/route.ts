import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";
import { getStagingAccessResponse } from "@/lib/staging-access";

export const runtime = "nodejs";

function authNotConfigured() {
  return !process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL;
}

export async function GET(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  if (authNotConfigured()) return Response.json({ message: "Administrative authentication is not configured." }, { status: 503 });
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  if (authNotConfigured()) return Response.json({ message: "Administrative authentication is not configured." }, { status: 503 });
  return toNextJsHandler(getAuth()).POST(request);
}
