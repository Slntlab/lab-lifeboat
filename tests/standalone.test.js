// Repo-layout checks for the standalone Lab Lifeboat tree: node --test
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), path = require("path");
const C = require("../core.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("index.html is standalone: no HomelabWise chrome, site CSS, analytics or verification tags", () => {
  const h = rd("index.html");
  assert.doesNotMatch(h, /site-header|crumbs|impact-site-verification|cloudflareinsights|static\.cloudflareinsights|\/style\.css|favicon\.ico|fonts\/Inter/);
  assert.match(h, /<script src="core\.js" defer>/);
  assert.match(h, /<script src="app\.js" defer>/);
  assert.match(h, /<link rel="stylesheet" href="lifeboat\.css">/);
  assert.match(h, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(h, /Hosted version:.*https:\/\/homelabwise\.com\/tools\/lab-lifeboat\/.*by SLNT Labs/s);
  assert.match(h, /href="restore-drill-reminder\.ics"/);
  assert.doesNotMatch(h, /rel="sponsored|awin1\.com|amzn\.to|amazon\.com\/dp|class="aff"/);
});

test("app.js, sw.js and the manifest use relative paths, not /tools/lab-lifeboat/", () => {
  for (const f of ["app.js", "sw.js", "manifest.webmanifest", "lifeboat.css"]) {
    const t = rd(f);
    assert.doesNotMatch(t, /\/tools\/lab-lifeboat\//, f + " still has an absolute tool path");
  }
  const sw = rd("sw.js");
  assert.match(sw, /self\.registration\.scope/);
  assert.match(sw, /var VERSION = "lifeboat-oss-/);
  const man = JSON.parse(rd("manifest.webmanifest"));
  assert.equal(man.start_url, "./?source=pwa");
  assert.equal(man.scope, "./");
  assert.ok(man.icons.every((i) => !i.src.startsWith("/")));
  assert.match(rd("app.js"), /serviceWorker\.register\(new URL\("sw\.js", document\.baseURI\), \{ scope: "\.\/" \}\)/);
});

test("restore-drill .ics is a valid quarterly all-day event", () => {
  const ics = rd("restore-drill-reminder.ics");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /\r\nRRULE:FREQ=MONTHLY;INTERVAL=3\r\n/);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:\d{8}\r\n/);
  assert.match(ics, /\r\nUID:[^\r]+\r\n/);
  assert.match(ics, /\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/);
  for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, "folded: " + l);
});

test("LICENSE is MIT (c) 2026 SLNT Labs", () => {
  const t = rd("LICENSE");
  assert.match(t, /MIT License/);
  assert.match(t, /Copyright \(c\) 2026 SLNT Labs/);
});

test("readiness score", () => {
  const st = C.emptyState(); assert.deepEqual(C.readiness(st), { total: 0, passed: 0, score: 0 });
  st.services.push(C.newService("immich")); assert.deepEqual(C.readiness(st), { total: 4, passed: 0, score: 0 });
  st.services.push(C.newService("jellyfin", { backupLocation: "/b", offsite: "B2", lastTested: "2026-11-01" })); assert.deepEqual(C.readiness(st), { total: 7, passed: 3, score: 43 });
  Object.assign(st.services[0], { backupLocation: "/b", offsite: "B2", lastTested: "2026-11-01", secretsWhere: "safe" }); assert.equal(C.readiness(st).score, 100);
  st.services.push(C.newService("nextcloud-aio", { borgLocation: "/mnt/backup/borg" })); assert.equal(C.readiness(st).passed, 8);
});
