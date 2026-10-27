const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertSafeDatabaseTarget() {
  const target = process.env.DATABASE_TARGET;
  const raw = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production") throw new Error("Database maintenance commands are disabled with NODE_ENV=production.");
  if (!raw || !target || !["local", "staging"].includes(target)) throw new Error("Set DATABASE_TARGET=local or staging and DATABASE_URL for an isolated database.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("DATABASE_URL is invalid."); }
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
  const host = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  if (!database || !host) throw new Error("DATABASE_URL is incomplete.");
  if (target === "local" && (!loopbackHosts.has(host) || !/(?:^|[_-])(?:local|test|dev)(?:$|[_-])/.test(database))) {
    throw new Error("DATABASE_TARGET=local requires a loopback host and a database name ending in local, test, or dev.");
  }
  if (target === "staging" && (!/(?:^|[_-])(?:staging|stage)(?:$|[_-])/.test(database) || loopbackHosts.has(host))) {
    throw new Error("DATABASE_TARGET=staging requires a non-loopback host and a database name containing staging or stage.");
  }
}
