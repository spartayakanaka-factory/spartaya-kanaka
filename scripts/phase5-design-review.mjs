// Apply the installed app-screen inspector to real authenticated browser pages.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";
if (process.env.P5_WORKSTREAM !== "1" || process.env.P3_BASE_URL !== "http://localhost:3008")
  throw Error("Exact local environment required");
const skill = path.resolve("../../../.agents/skills/design-taste-frontend/scripts/lib");
const { probe, app } = await import(pathToFileURL(path.join(skill, "probe.mjs")));
const { judgeApp } = await import(pathToFileURL(path.join(skill, "rules.mjs")));
const f = JSON.parse(await readFile(path.join(process.env.P3_STATE_DIR, "staff.json"))),
  base = process.env.P3_BASE_URL;
const b = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const c = await b.newContext();
const p = await c.newPage();
const reports = [];
try {
  const r = await c.request.post(base + "/api/auth/sign-in/email", {
    headers: { origin: base },
    data: { email: f.staff[0].email, password: f.staff[0].password },
  });
  assert.equal(r.status(), 200);
  for (const width of [390, 768, 1440]) {
    await p.setViewportSize({ width, height: 960 });
    for (const route of ["/admin", "/admin/products", "/admin/orders"]) {
      await p.goto(base + route, { waitUntil: "networkidle" });
      await p.evaluate(() => document.fonts.ready);
      const m = await p.evaluate(probe),
        a = await p.evaluate(app);
      reports.push({ route, width, findings: judgeApp(a, m, { width }) });
    }
  }
  await mkdir(".taste-skill", { recursive: true });
  await writeFile(".taste-skill/admin-review.json", JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} finally {
  await b.close();
}
