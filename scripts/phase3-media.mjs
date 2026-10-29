// Filesystem-backed S3 development service. All interfaces bind to loopback.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const state = path.resolve(process.env.P3_STATE_DIR || path.join(root, ".local/phase3-runtime"));
const directory = path.join(state, "media");
const pidFile = path.join(directory, "pid");
const originals = "sprtaya-phase3-originals";
const display = "sprtaya-phase3-display";
const endpoint = "http://127.0.0.1:39010";
mkdirSync(directory, { recursive: true, mode: 0o700 });

function privateFile(file, value) {
  writeFileSync(file, value, { mode: 0o600 });
  chmodSync(file, 0o600);
}
function running() {
  if (!existsSync(pidFile)) return false;
  try { process.kill(Number(readFileSync(pidFile, "utf8")), 0); return true; } catch (error) { return error.code === "EPERM"; }
}
const command = process.argv[2] || "start";
if (command === "stop") {
  if (running()) process.kill(Number(readFileSync(pidFile, "utf8")), "SIGTERM");
  for (let i = 0; i < 100 && running(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  if (running()) throw new Error("Local media server did not stop cleanly.");
  console.log("Local media stopped; stored objects preserved.");
} else {
  const secretsFile = path.join(directory, "credentials.json");
  const keys = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8")) : {
    app: randomBytes(16).toString("hex"), secret: randomBytes(32).toString("hex"),
    admin: randomBytes(16).toString("hex"), adminSecret: randomBytes(32).toString("hex"),
  };
  privateFile(secretsFile, JSON.stringify(keys));
  const configuration = path.join(directory, "s3.json");
  privateFile(configuration, JSON.stringify({ identities: [
    { name: "anonymous", actions: ["Read:" + display] },
    { name: "local-app", credentials: [{ accessKey: keys.app, secretKey: keys.secret }], actions: ["Read:" + originals, "Write:" + originals, "Read:" + display, "Write:" + display] },
    { name: "local-bootstrap", credentials: [{ accessKey: keys.admin, secretKey: keys.adminSecret }], actions: ["Admin", "Read", "Write", "List"] },
  ] }));
  if (!running()) {
    const log = openSync(path.join(directory, "server.log"), "a", 0o600);
    const child = spawn(process.env.P3_WEED_BINARY || path.join(process.env.P2_RUNTIME_DIR || path.join(root, ".local/phase2-runtime"), "tools/weed"), ["mini", "-dir=" + directory,
      "-ip=127.0.0.1", "-ip.bind=127.0.0.1", "-master.port=39011", "-volume.port=39012", "-filer.port=39013",
      "-master.telemetry=false", "-admin.ui=false", "-admin.port.legacy=0", "-webdav=false", "-s3.iam=false",
      "-s3.port=39010", "-s3.port.iceberg=0", "-s3.port.lance=0", "-s3.config=" + configuration,
      "-s3.allowedOrigins=http://localhost:3003", "-filer.allowedOrigins=http://localhost:3003", "-filer.disableDirListing=true",
    ], { cwd: directory, detached: true, stdio: ["ignore", log, log] });
    child.unref();
    privateFile(pidFile, String(child.pid));
  }
  const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: keys.admin, secretAccessKey: keys.adminSecret } });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      for (const Bucket of [originals, display]) {
        try { await client.send(new HeadBucketCommand({ Bucket })); }
        catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; await client.send(new CreateBucketCommand({ Bucket })); }
      }
      ready = true; break;
    } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  client.destroy();
  if (!ready) throw new Error("Local S3 startup failed. Inspect the private media/server.log.");
  for (const name of ["env.local", "env.test"]) {
    const file = path.join(state, "database", name);
    if (!existsSync(file)) continue;
    const values = { ...parse(readFileSync(file)), MEDIA_S3_ENDPOINT: endpoint, MEDIA_S3_REGION: "us-east-1", MEDIA_S3_FORCE_PATH_STYLE: "true",
      MEDIA_S3_ORIGINALS_BUCKET: originals, MEDIA_S3_DISPLAY_BUCKET: display,
      MEDIA_ACCESS_KEY_ID: keys.app, MEDIA_SECRET_ACCESS_KEY: keys.secret, MEDIA_PUBLIC_BASE_URL: endpoint + "/" + display };
    privateFile(file, Object.entries(values).map(([key, value]) => key + "=" + value).join("\n") + "\n");
  }
  console.log("Persistent local S3 ready on 127.0.0.1:39010; private originals and public display buckets configured.");
}
