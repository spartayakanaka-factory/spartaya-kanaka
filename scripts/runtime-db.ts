import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";

export function createRuntimeDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required.");
  const url = new URL(raw);
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || !url.hostname || !url.username) throw new Error("DATABASE_URL is incomplete.");
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 5,
    acquireTimeout: 10_000,
    connectTimeout: 10_000,
    idleTimeout: 60,
  });
  return new PrismaClient({ adapter });
}
