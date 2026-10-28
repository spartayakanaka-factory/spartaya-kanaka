import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getStagingAccessResponse } from "@/lib/staging-access";

/**
 * Server-rendered fallback for deployments where Hostinger's Node entry point
 * does not execute Next.js Proxy. The Proxy remains the first request gate.
 */
export async function requireStagingPageAccess() {
  const blocked = getStagingAccessResponse(await headers());
  if (blocked) notFound();
}
