import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.DATABASE_TARGET;
const raw = process.env.DATABASE_URL;

if (process.env.NODE_ENV === "production") throw new Error("Migration deployment is disabled with NODE_ENV=production.");
if (!raw || !["local", "staging"].includes(target)) throw new Error("Set DATABASE_TARGET=local or staging and DATABASE_URL for an isolated database.");
const url = new URL(raw);
if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
const host = url.hostname.toLowerCase();
const loopback = ["localhost", "127.0.0.1", "::1"].includes(host);
if (!database) throw new Error("DATABASE_URL is incomplete.");
if (target === "local" && (!loopback || !/(?:^|[_-])(?:local|test|dev)(?:$|[_-])/.test(database))) throw new Error("DATABASE_TARGET=local requires a loopback host and a database name ending in local, test, or dev.");
if (target === "staging" && (loopback || !/(?:^|[_-])(?:staging|stage)(?:$|[_-])/.test(database))) throw new Error("DATABASE_TARGET=staging requires a non-loopback host and a database name containing staging or stage.");

const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
