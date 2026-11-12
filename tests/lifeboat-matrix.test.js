// Exhaustive option matrix for the Lab Lifeboat runbook generator: node --test tests/lifeboat-matrix.test.js
const test = require("node:test"), assert = require("node:assert/strict");
const C = require("../core.js");
const TYPES = ["immich", "vaultwarden", "jellyfin", "nextcloud-aio", "caddy", "home-assistant", "paperless-ngx", "proxmox", "custom"];
const COMMON_OUT = ["name", "domain", "version", "backupMethod", "backupLocation", "offsite", "schedule", "lastTested", "secretsWhere", "notes"];
const J = x => JSON.stringify(x);
const W = { loc: /No backup location/, off: /No offsite copy/, test: /No restore test/, sec: /where this service's secrets/ };

// Expected placeholders when a type field is left empty, and the default used instead
const EMPTY = {
  immich: { composeDir: "<COMPOSE_DIR>", uploadLocation: "<UPLOAD_LOCATION>", dbDataLocation: "<DB_DATA_LOCATION>", port: ":2283" },
  vaultwarden: { composeDir: "<COMPOSE_DIR>", dataDir: "<DATA_DIR>", container: "stop vaultwarden" },
  jellyfin: { composeDir: "<COMPOSE_DIR>", configDir: "<CONFIG_DIR>", cacheDir: "<CACHE_DIR>", mediaDirs: "<MEDIA_DIRS>", port: ":8096" },
  "nextcloud-aio": { aioPort: "port 8080", borgLocation: "<BORG_LOCATION>" },
  caddy: { composeDir: "<COMPOSE_DIR>", caddyfile: "<CADDYFILE>", dataDir: "<CADDY_DATA>", configDir: "<CADDY_CONFIG>" },
  "home-assistant": { configDir: "<CONFIG_DIR>", radios: "<RADIOS>", installType: "(record HA OS or Container)", port: ":8123" },
  "paperless-ngx": { composeDir: "<COMPOSE_DIR>", exportDir: "<EXPORT_DIR>", volumes: "<VOLUMES>", port: ":8000" },
  proxmox: { backupStorage: "<BACKUP_STORAGE>", guests: "<VMIDS>", hostConfig: "<HOST_CONFIG>", port: ":8006" },
  custom: { composeDir: "<COMPOSE_DIR>", dataPaths: "<DATA_PATHS>" }
};

for (const t of TYPES) {
  const fields = C.TYPES[t].fields.map(f => f[0]);

  test(`${t}: every field (common + type-specific) appears in the runbook`, () => {
    const s = C.newService(t);
    for (const k of COMMON_OUT.concat(fields)) s[k] = k === "lastTested" ? "2026-11-01" : "MARK" + k + "X";
    const out = J(C.generateRunbook(s));
    for (const k of COMMON_OUT.concat(fields)) {
      const m = k === "lastTested" ? "2026-11-01" : "MARK" + k + "X";
      if (t === "nextcloud-aio" && k === "backupLocation") continue; // AIO prefers borgLocation; checked below
      if (t === "custom" && k === "restoreSteps") continue; // checked separately
      assert.ok(out.includes(m), `${t}.${k} missing from output`);
    }
  });

  test(`${t}: each type field left empty gives a placeholder or the documented default`, () => {
    const out = J(C.generateRunbook(C.newService(t)));
    for (const [k, v] of Object.entries(EMPTY[t])) assert.ok(out.includes(v), `${t}.${k} empty -> ${v}`);
    assert.ok(!/undefined|null|NaN/.test(out));
  });

  test(`${t}: each field changes only by its own value (single-field edits)`, () => {
    const base = J(C.generateRunbook(C.newService(t, { id: "x" })));
    for (const k of fields.concat(["domain", "version", "schedule", "notes", "backupMethod", "offsite", "secretsWhere", "lastTested", "backupLocation"])) {
      const v = k === "lastTested" ? "2026-11-02" : "VAL" + k;
      const out = J(C.generateRunbook(C.newService(t, { id: "x", [k]: v })));
      assert.notEqual(out, base, `${t}.${k} has no effect on output`);
      assert.ok(out.includes(v), `${t}.${k} value not shown`);
    }
  });

  test(`${t}: all 16 combinations of backup location / offsite / restore test / secrets location give the right warnings`, () => {
    for (let m = 0; m < 16; m++) {
      const o = {};
      if (m & 1) o.backupLocation = "/b"; if (m & 2) o.offsite = "B2"; if (m & 4) o.lastTested = "2026-11-01"; if (m & 8) o.secretsWhere = "Vaultwarden item";
      const w = C.generateRunbook(C.newService(t, o)).warnings.join(" | ");
      const want = { loc: !(m & 1), off: !(m & 2), test: !(m & 4), sec: !(m & 8) && t !== "jellyfin" && t !== "proxmox" };
      for (const k of Object.keys(W)) assert.equal(W[k].test(w), want[k], `${t} combo ${m}: warning ${k}`);
      const facts = Object.fromEntries(C.generateRunbook(C.newService(t, o)).facts);
      assert.equal(facts["Backup location"], m & 1 ? "/b" : "(not set)");
      assert.equal(facts["Offsite copy"], m & 2 ? "B2" : "(none recorded)");
      assert.equal(facts["Last restore test"], m & 4 ? "2026-11-01" : "never recorded");
      assert.equal(facts["Secrets are stored in"], m & 8 ? "Vaultwarden item" : "(not recorded)");
    }
  });

  test(`${t}: host link — none, full, unnamed`, () => {
    const st = C.emptyState(); const h = C.newHost({ name: "mini", ip: "10.0.0.5", os: "Debian 13" }), h2 = C.newHost({ ip: "10.0.0.6" }); st.hosts.push(h, h2);
    const f = s => Object.fromEntries(C.generateRunbook(s, st).facts).Host;
    assert.equal(f(C.newService(t)), "(not set)");
    assert.equal(f(C.newService(t, { hostId: h.id })), "mini · 10.0.0.5 · Debian 13");
    assert.equal(f(C.newService(t, { hostId: h2.id })), "(unnamed) · 10.0.0.6");
  });

  test(`${t}: version — default pin, override, schedule shown only when set`, () => {
    const pin = C.VERSIONS[t] || "(not set)";
    assert.equal(Object.fromEntries(C.generateRunbook(C.newService(t)).facts)["Version to restore"], pin);
    assert.equal(Object.fromEntries(C.generateRunbook(C.newService(t, { version: "9.9" })).facts)["Version to restore"], "9.9");
    assert.ok(!C.generateRunbook(C.newService(t)).facts.some(x => x[0] === "Schedule"));
    assert.ok(C.generateRunbook(C.newService(t, { schedule: "Daily" })).facts.some(x => x[0] === "Schedule"));
    assert.ok(!C.generateRunbook(C.newService(t)).facts.some(x => x[0] === "Domain / URL"));
  });

  test(`${t}: Markdown has every section, numbered steps and one fence per code step`, () => {
    const st = C.emptyState(); st.services.push(C.newService(t));
    const r = C.generateRunbook(st.services[0]), md = C.toMarkdown(C.generatePack(st));
    for (const s of r.sections) assert.ok(md.includes("### " + s.h), s.h);
    const codes = r.sections.flatMap(s => s.steps).filter(x => x.code).length;
    assert.equal((md.match(/```sh/g) || []).length, codes);
    for (const l of r.links) assert.ok(md.includes(l.url));
  });

  test(`${t}: export/import round trip keeps every field`, () => {
    const s = C.newService(t); for (const k of COMMON_OUT.concat(fields)) s[k] = "v-" + k;
    const st = C.emptyState(); st.services.push(s);
    assert.deepEqual(C.importPack(C.exportPack(st)).state.services[0], s);
  });
}

test("type-specific content checks", () => {
  const im = J(C.generateRunbook(C.newService("immich", { uploadLocation: "/p", dbDataLocation: "/db" })));
  for (const k of ["/p/backups", "new, empty DB_DATA_LOCATION (/db)", "IMMICH_VERSION is v3.4.1", "last 14", "Restore from backup"]) assert.ok(im.includes(k), k);
  const vw = J(C.generateRunbook(C.newService("vaultwarden", { container: "vw1" })));
  for (const k of ["docker compose stop vw1", "docker exec vw1 /vaultwarden backup", "db.sqlite3-wal", "db.sqlite3-shm"]) assert.ok(vw.includes(k), k);
  const aio = J(C.generateRunbook(C.newService("nextcloud-aio", { aioPort: "9443", datadir: "/mnt/ncdata", borgLocation: "ssh://u@h:22/r" })));
  for (const k of ["port 9443", "NEXTCLOUD_DATADIR (/mnt/ncdata)", "ssh://u@h:22/r", "must include @ and :"]) assert.ok(aio.includes(k), k);
  assert.ok(!J(C.generateRunbook(C.newService("nextcloud-aio"))).includes("NEXTCLOUD_DATADIR"), "no datadir line when unset");
  const cd = C.generateRunbook(C.newService("caddy", { domain: "a.example, b.example" }));
  assert.ok(J(cd).includes("public IP (a.example, b.example)"));
  assert.ok(!J(C.generateRunbook(C.newService("caddy"))).includes("public IP ("));
  const jf = J(C.generateRunbook(C.newService("jellyfin", { port: "8920" })));
  assert.ok(jf.includes(":8920"));
});

test("Home Assistant, Paperless-ngx, Proxmox content checks (official docs 2026-11-10)", () => {
  const ha = J(C.generateRunbook(C.newService("home-assistant", { radios: "ZBT-2", secretsWhere: "safe sheet" })));
  for (const k of ["emergency kit", "seven groups of four", "Upload backup", "2 GB", "homeassistant.local:4357", "Plug the Zigbee", "ZBT-2", "safe sheet", "migrate Zigbee", "MariaDB", "2026.11.1"]) assert.ok(ha.includes(k), k);
  const pl = J(C.generateRunbook(C.newService("paperless-ngx", { composeDir: "/opt/pl" })));
  for (const k of ["document_importer ../export", "--passphrase", "completely empty", "API tokens", "document_sanity_checker", "cd /opt/pl", "v3.4.2", "paperless_media"]) assert.ok(pl.includes(k), k);
  const pv = J(C.generateRunbook(C.newService("proxmox", { backupStorage: "pbs1", guests: "100 web" })));
  for (const k of ["qmrestore <ARCHIVE> <VMID>", "pct restore <VMID> <ARCHIVE>", "pbs1", "100 web", "do not include the host", "Datacenter > Storage > Add", "Datacenter > Backup", "fingerprint", "9.2"]) assert.ok(pv.includes(k), k);
});

test("Nextcloud AIO: borgLocation counts as the backup location; backupLocation is the fallback", () => {
  const a = C.generateRunbook(C.newService("nextcloud-aio", { borgLocation: "/borg" }));
  assert.ok(!a.warnings.some(w => W.loc.test(w)));
  assert.equal(Object.fromEntries(a.facts)["Backup location"], "/borg");
  const b = C.generateRunbook(C.newService("nextcloud-aio", { backupLocation: "/alt" }));
  assert.ok(J(b).includes("The Borg backup repository: /alt"));
});

test("custom: with and without own steps", () => {
  const without = C.generateRunbook(C.newService("custom"));
  assert.ok(J(without).includes("Add your own steps"));
  assert.ok(without.sections[1].steps.some(x => x.code));
  const w = C.generateRunbook(C.newService("custom", { restoreSteps: "A\nB" }));
  assert.deepEqual(w.sections[1].steps, ["A", "B"]);
  assert.equal(C.generateRunbook(C.newService("custom")).title, "Custom service recovery runbook");
  assert.ok(J(C.generateRunbook(C.newService("custom", { version: "2.1" }))).includes("(2.1)"));
});

test("lab name and lab notes reach the pack and Markdown", () => {
  const st = C.emptyState(); st.lab = { name: "Den", notes: "UPS in closet" }; st.services.push(C.newService("caddy"));
  const p = C.generatePack(st); assert.equal(p.title, "Den recovery pack"); assert.equal(p.notes, "UPS in closet");
  assert.ok(C.toMarkdown(p).includes("UPS in closet"));
  assert.equal(C.generatePack(C.emptyState()).title, "My homelab recovery pack");
});

test("restore order with duplicates of every type", () => {
  const st = C.emptyState();
  for (const t of TYPES.slice().reverse()) st.services.push(C.newService(t), C.newService(t));
  assert.deepEqual(C.generatePack(st).runbooks.map(r => r.type), ["proxmox", "proxmox", "vaultwarden", "vaultwarden", "caddy", "caddy", "home-assistant", "home-assistant", "nextcloud-aio", "nextcloud-aio", "immich", "immich", "paperless-ngx", "paperless-ngx", "jellyfin", "jellyfin", "custom", "custom"]);
});
