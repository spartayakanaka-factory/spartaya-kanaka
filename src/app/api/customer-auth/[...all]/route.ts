import { getStagingAccessResponse } from "@/lib/staging-access";
import { getCustomerAuth } from "@/lib/server/commerce/customer-auth";
import { commerceEnabled } from "@/lib/commerce/runtime";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const blocked = getStagingAccessResponse(request.headers);
  if (blocked) return blocked;
  if (!commerceEnabled() || process.env.P3_CUSTOMER_ACCOUNTS !== "1")
    return Response.json({ error: "DISABLED" }, { status: 503 });
  return getCustomerAuth().handler(request);
}
export const GET = handle;
export const POST = handle;
