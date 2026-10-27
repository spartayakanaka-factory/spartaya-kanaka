import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production") throw new Error("Development migrations are disabled with NODE_ENV=production.");
if (process.env.DATABASE_TARGET !== "local" || !raw) throw new Error("Development migrations require DATABASE_TARGET=local and an isolated local DATABASE_URL.");
const url = new URL(raw);
const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) || !/(?:^|[_-])(?:local|test|dev)(?:$|[_-])/.test(database)) {
  throw new Error("Development migrations require a loopback MySQL URL and database name ending in local, test, or dev.");
}
const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "dev"], { cwd: root, env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
