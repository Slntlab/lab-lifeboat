// Lab Lifeboat core tests: node --test tests/lifeboat.test.js
const test = require("node:test"), assert = require("node:assert/strict");
const C = require("../core.js");

function lab() {
  const s = C.emptyState(); s.lab.name = "Test lab";
  const h = C.newHost({ name: "mini", ip: "192.168.1.10", os: "Debian 13" }); s.hosts.push(h);
  for (const t of ["immich", "vaultwarden", "jellyfin", "nextcloud-aio", "caddy", "home-assistant", "paperless-ngx", "proxmox", "custom"]) s.services.push(C.newService(t, { hostId: h.id }));
  return s;
}
const text = rb => JSON.stringify(rb);

test("pinned versions match the guides", () => {
  assert.deepEqual(C.VERSIONS, { immich: "v3.3.6", vaultwarden: "1.37.5", jellyfin: "v12.4", "nextcloud-aio": "v15.0.2", caddy: "2.11.9", "home-assistant": "2026.11.1", "paperless-ngx": "v3.4.2", proxmox: "9.2" });
  for (const t of Object.keys(C.VERSIONS)) assert.equal(C.newService(t).version, C.VERSIONS[t]);
});

test("every built-in runbook links to HomelabWise guides with absolute URLs", () => {
  const p = C.generatePack(lab());
  for (const r of p.runbooks) {
    if (r.type !== "custom") assert.ok(r.links.length >= 1, r.type + " has guide links");
    for (const l of r.links) {
      assert.ok(l.href.startsWith("/"), l.href + " is a site path");
      assert.equal(l.url, "https://homelabwise.com" + l.href);
    }
  }
});

test("restore order: Proxmox, Vaultwarden, Caddy, HA, AIO, Immich, Paperless, Jellyfin, custom", () => {
  assert.deepEqual(C.generatePack(lab()).runbooks.map(r => r.type), ["proxmox", "vaultwarden", "caddy", "home-assistant", "nextcloud-aio", "immich", "paperless-ngx", "jellyfin", "custom"]);
});

test("Immich runbook: same version, UPLOAD_LOCATION folders, onboarding restore, down -v warning", () => {
  const s = C.newService("immich", { composeDir: "/opt/immich", uploadLocation: "/mnt/photos" });
  const t = text(C.generateRunbook(s));
  for (const k of ["v3.3.6", "/mnt/photos/backups", "Restore from backup", "encoded-video", "docker compose down -v", "cd /opt/immich", "Administration > Maintenance", "2283"]) assert.ok(t.includes(k), k);
});

test("Vaultwarden runbook: WAL warning, attachments, backup command", () => {
  const t = text(C.generateRunbook(C.newService("vaultwarden", { dataDir: "/srv/vw-data", container: "vw" })));
  for (const k of ["db.sqlite3-wal", "attachments", "rsa_key", "docker exec vw /vaultwarden backup", "/srv/vw-data", "vaultwarden/server:1.37.5"]) assert.ok(t.includes(k), k);
});

test("Nextcloud AIO runbook: Borg password, remote ssh, new-server path", () => {
  const t = text(C.generateRunbook(C.newService("nextcloud-aio", { borgLocation: "ssh://u@backup:22/aio" })));
  for (const k of ["ssh://u@backup:22/aio", "encryption password", "Restore AIO instance from backup", "Start and update containers", "authorized_keys", "v15.0.2"]) assert.ok(t.includes(k), k);
});

test("Caddy and Jellyfin runbooks cover data folders and ports", () => {
  const c = text(C.generateRunbook(C.newService("caddy")));
  for (const k of ["caddy:2.11.9", "/data", "caddy validate", "UDP 443", "caddy reload"]) assert.ok(c.includes(k), k);
  const j = text(C.generateRunbook(C.newService("jellyfin", { mediaDirs: "/mnt/media:/media" })));
  for (const k of ["/config", "/mnt/media:/media", "same container paths", "/dev/dri", "8096", "v12.4"]) assert.ok(j.includes(k), k);
});

test("missing paths become placeholders, not 'undefined'", () => {
  const p = C.generatePack(lab());
  const t = text(p);
  assert.ok(!t.includes("undefined") && !t.includes("null"));
  assert.ok(t.includes("<UPLOAD_LOCATION>") && t.includes("<COMPOSE_DIR>"));
});

test("custom service uses the user's own steps", () => {
  const r = C.generateRunbook(C.newService("custom", { name: "Paperless", restoreSteps: "Stop it\n\n  Copy media back  \nStart it" }));
  assert.equal(r.title, "Paperless recovery runbook");
  assert.deepEqual(r.sections[1].steps, ["Stop it", "Copy media back", "Start it"]);
});

test("warnings when backup, offsite, test date or secrets location are missing", () => {
  assert.equal(C.generateRunbook(C.newService("immich")).warnings.length, 4);
  const ok = C.newService("immich", { backupLocation: "/b", offsite: "B2", lastTested: "2026-11-01", secretsWhere: "Vaultwarden" });
  assert.equal(C.generateRunbook(ok).warnings.length, 0);
});

test("secret detector flags real secrets but not normal paths and notes", () => {
  const bad = ["DB_PASSWORD=hunter2hunter2", "admin token: Zx81!kq92",  "-----BEGIN OPENSSH PRIVATE KEY-----", "$argon2id$v=19$m=65540,t=3,p=4$abc", "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "Xk9vT2pLmN4qR7sU1wY3zA5bC8dE0fGh"];
  for (const v of bad) assert.ok(C.secretReason(v), "flags " + v);
  const good = ["/mnt/Backups2024/ImmichLibraryPhotosArchive/originals", "Vaultwarden item \"Immich .env\"", "paper sheet in the home safe",
    "ssh://user@backup.example.com:23/./aio-borg", "192.168.1.10", "skip_this_folder_when_restoring", "Admin token and backup password: printed sheet in the home safe", "copy the data back then run docker compose up and check the logs again please"];
  for (const v of good) assert.equal(C.secretReason(v), "", "does not flag " + v);
  const s = lab(); s.services[0].secretsWhere = "password: Sup3rSecret!";
  assert.equal(C.findSecretLike(s).length, 1);
});

test("export then import round-trips the lab", () => {
  const s = lab(); s.services[0].uploadLocation = "/mnt/photos"; s.services[0].notes = "line1\nline2 <b>x</b>";
  const json = C.exportPack(s, new Date("2026-11-10T00:00:00Z"));
  const d = JSON.parse(json);
  assert.equal(d.schema, "hlw-lab-lifeboat"); assert.equal(d.version, 1); assert.equal(d.exportedAt, "2026-11-10T00:00:00.000Z");
  const r = C.importPack(json);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.state.hosts, s.hosts);
  assert.deepEqual(r.state.services.map(x => ({ ...x })), s.services.map(x => ({ ...x })));
  assert.equal(r.state.lab.name, "Test lab");
});

test("export drops transient and unknown fields", () => {
  const s = lab(); s.services[0]._open = true; s.services[0].evil = "x"; s.hosts[0].extra = 1;
  const d = JSON.parse(C.exportPack(s));
  assert.ok(!("_open" in d.services[0]) && !("evil" in d.services[0]) && !("extra" in d.hosts[0]));
});

test("import rejects bad files", () => {
  assert.throws(() => C.importPack("not json"), /not valid JSON/);
  assert.throws(() => C.importPack(JSON.stringify({ schema: "other" })), /not a Lab Lifeboat file/);
  assert.throws(() => C.importPack(JSON.stringify({ schema: "hlw-lab-lifeboat", version: 99 })), /newer/);
  assert.throws(() => C.importPack("x".repeat(1000001)), /too large/);
  assert.throws(() => C.importPack(null), /JSON text/);
});

test("import sanitises: unknown type -> custom, dangling host cleared, duplicate ids fixed, long values cut", () => {
  const f = { schema: "hlw-lab-lifeboat", version: 1, hosts: [{ id: "a", name: "h1" }, { id: "a", name: "h2" }],
    services: [{ id: "s1", type: "plex", name: "Plex", hostId: "zzz" }, { id: "s1", type: "immich", notes: "y".repeat(9000), uploadLocation: 5 }] };
  const r = C.importPack(JSON.stringify(f));
  assert.equal(r.state.services[0].type, "custom"); assert.equal(r.state.services[0].hostId, "");
  assert.ok(r.warnings.some(w => /Unknown service type/.test(w)) && r.warnings.some(w => /host link/.test(w)));
  assert.notEqual(r.state.hosts[0].id, r.state.hosts[1].id); assert.notEqual(r.state.services[0].id, r.state.services[1].id);
  assert.equal(r.state.services[1].notes.length, 4000); assert.equal(r.state.services[1].uploadLocation, "5");
});

test("import warns when secrets slipped in", () => {
  const s = lab(); s.hosts[0].notes = "root pwd=letmein123";
  assert.ok(C.importPack(C.exportPack(s)).warnings.some(w => /look like real secrets/.test(w)));
});

test("Markdown output: hosts table, order, steps, code fences, guide URLs", () => {
  const s = lab(); s.hosts[0].name = "mini|pc";
  const md = C.toMarkdown(C.generatePack(s, new Date(2026, 10, 10)));
  assert.ok(md.startsWith("# Test lab recovery pack"));
  assert.ok(md.includes("Generated 2026-11-10"));
  assert.ok(md.includes("| mini\\|pc | 192.168.1.10 |"));
  assert.ok(md.includes("## Restore order\n\n1. Proxmox VE\n2. Vaultwarden"));
  assert.ok(md.includes("```sh\ncd <COMPOSE_DIR>"));
  assert.ok(md.includes("(https://homelabwise.com/guides/immich-backup-restore/)"));
});
