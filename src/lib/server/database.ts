import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let runtimeDatabase: PrismaClient | undefined;

function readDatabaseConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not configured for this environment.");
  const url = new URL(raw);
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use the mysql:// protocol.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || !url.hostname || !url.username) throw new Error("DATABASE_URL is incomplete.");
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 5,
    acquireTimeout: 10_000,
    idleTimeout: 60,
    connectTimeout: 10_000,
  };
}

export function getDatabase() {
  if (runtimeDatabase) return runtimeDatabase;
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const adapter = new PrismaMariaDb(readDatabaseConfig());
  const prisma = new PrismaClient({ adapter });
  runtimeDatabase = prisma;
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  return prisma;
}
