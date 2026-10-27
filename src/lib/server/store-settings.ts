import "server-only";
import { connection } from "next/server";
import { site } from "@/lib/site-config";
import { getDatabase } from "@/lib/server/database";

export async function getStoreContactSettings() {
  const fallback = { phone: site.factoryPhone, whatsapp: site.factoryPhone, email: "", descriptionAr: "" };
  if (process.env.CATALOG_SOURCE !== "mysql") return fallback;
  await connection();
  const rows = await getDatabase().storeSetting.findMany({ where: { key: { in: ["phone", "whatsapp", "email", "descriptionAr"] } } });
  const values = Object.fromEntries(rows.map((row) => [row.key, typeof row.value === "string" ? row.value : ""]));
  const phone = values.phone && /^\+?[\d\s()-]{7,30}$/.test(values.phone) ? values.phone : fallback.phone;
  const whatsapp = values.whatsapp && /^\+?[\d\s()-]{7,30}$/.test(values.whatsapp) ? values.whatsapp : phone;
  const email = values.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? values.email : "";
  return { phone, whatsapp, email, descriptionAr: values.descriptionAr ?? "" };
}
