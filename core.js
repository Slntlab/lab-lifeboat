/* Lab Lifeboat core (HomelabWise). Pure functions: data model, secret check, runbook generator, import/export.
   No network, no DOM. Works in the browser (window.LifeboatCore) and in Node (module.exports). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LifeboatCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var SCHEMA = "hlw-lab-lifeboat", SCHEMA_VERSION = 1, MAX_IMPORT_BYTES = 1000000, MAX_FIELD = 4000;
  var SITE = "https://homelabwise.com";

  // Versions pinned in HomelabWise guides (last checked 2026-11-12).
  var VERSIONS = { immich: "v3.4.1", vaultwarden: "1.37.5", jellyfin: "v12.4", "nextcloud-aio": "v15.0.2", caddy: "2.11.9",
    "home-assistant": "2026.11.1", "paperless-ngx": "v3.4.2", proxmox: "9.2" };

  var G = {
    immichBackup: ["/guides/immich-backup-restore/", "Immich backup and restore"],
    immichInstall: ["/guides/immich-docker-compose/", "Immich Docker Compose setup"],
    immichRestic: ["/guides/immich-offsite-backup-restic/", "Immich offsite backup with restic"],
    immichCaddy: ["/guides/immich-reverse-proxy-caddy/", "Immich reverse proxy with Caddy"],
    vwBackup: ["/guides/vaultwarden-backup/", "Vaultwarden backup and restore"],
    vwInstall: ["/guides/vaultwarden-docker-https/", "Vaultwarden with Docker and HTTPS"],
    vwErrors: ["/guides/vaultwarden-errors/", "Vaultwarden errors and fixes"],
    jfQsv: ["/guides/jellyfin-quick-sync-docker/", "Jellyfin Quick Sync in Docker"],
    jfCaddy: ["/guides/jellyfin-reverse-proxy-caddy/", "Jellyfin reverse proxy with Caddy"],
    jfTrouble: ["/guides/jellyfin-transcoding-troubleshooting/", "Jellyfin transcoding troubleshooting"],
    aioBorg: ["/guides/nextcloud-aio-backup-borg/", "Nextcloud AIO backup with BorgBackup"],
    aioVps: ["/vps/nextcloud-aio-vps/", "Nextcloud AIO on a VPS"],
    remote: ["/guides/tailscale-vs-wireguard-vs-cloudflare-tunnel/", "Tailscale vs WireGuard vs Cloudflare Tunnel"],
    haHw: ["/hardware/home-assistant-mini-pc-vs-raspberry-pi/", "Home Assistant: mini PC vs Raspberry Pi"],
    plSetup: ["/guides/paperless-ngx-docker-setup/", "Paperless-ngx Docker setup and backups"],
    pveInstall: ["/os/proxmox-install-mini-pc/", "Install Proxmox VE on a mini PC"],
    pveVsUnraid: ["/compare/proxmox-vs-unraid/", "Proxmox vs Unraid"]
  };
  function link(k) { return { href: G[k][0], title: G[k][1], url: SITE + G[k][0] }; }

  // Field definitions per service type: [key, label, placeholder/default hint]
  var TYPES = {
    immich: { label: "Immich", fields: [
      ["composeDir", "Compose folder (docker-compose.yml + .env)", "/opt/immich"],
      ["uploadLocation", "UPLOAD_LOCATION (photos + DB dumps)", "/mnt/photos/immich"],
      ["dbDataLocation", "DB_DATA_LOCATION (Postgres data)", "./postgres"],
      ["port", "Port", "2283"]] },
    vaultwarden: { label: "Vaultwarden", fields: [
      ["composeDir", "Compose folder", "/opt/vaultwarden"],
      ["dataDir", "Data folder on host (mounted at /data)", "./vw-data"],
      ["container", "Container name", "vaultwarden"]] },
    jellyfin: { label: "Jellyfin", fields: [
      ["composeDir", "Compose folder", "/opt/jellyfin"],
      ["configDir", "Config folder (mounted at /config)", "/opt/jellyfin/config"],
      ["cacheDir", "Cache folder (mounted at /cache)", "/opt/jellyfin/cache"],
      ["mediaDirs", "Media folders and their container paths", "/mnt/media:/media"],
      ["port", "Port", "8096"]] },
    "nextcloud-aio": { label: "Nextcloud AIO", fields: [
      ["aioPort", "AIO interface port", "8080"],
      ["datadir", "Nextcloud data folder (NEXTCLOUD_DATADIR, if set)", "default volume"],
      ["borgLocation", "Borg backup location (path or ssh://user@host:port/path)", "/mnt/backup/borg"]] },
    caddy: { label: "Caddy", fields: [
      ["composeDir", "Compose folder", "/opt/caddy"],
      ["caddyfile", "Caddyfile path", "/opt/caddy/Caddyfile"],
      ["dataDir", "Data folder (mounted at /data: certificates)", "./caddy-data"],
      ["configDir", "Config folder (mounted at /config)", "./caddy-config"]] },
    "home-assistant": { label: "Home Assistant", fields: [
      ["installType", "Install type (HA OS or Container)", "Home Assistant OS"],
      ["configDir", "Config folder (Container only)", "/opt/homeassistant/config"],
      ["radios", "Radios / USB sticks (Zigbee, Z-Wave, Thread)", "Connect ZBT-2 on USB 2"],
      ["port", "Port", "8123"]] },
    "paperless-ngx": { label: "Paperless-ngx", fields: [
      ["composeDir", "Compose folder", "/opt/paperless"],
      ["exportDir", "Export folder on host (document_exporter target)", "/opt/paperless/export"],
      ["volumes", "Docker volumes (if you back these up instead)", "paperless_media, paperless_data, paperless_pgdata"],
      ["port", "Port", "8000"]] },
    proxmox: { label: "Proxmox VE", fields: [
      ["backupStorage", "Backup storage (PBS or NFS/dir storage ID)", "pbs-backup"],
      ["guests", "Guests to restore (VMID and name)", "100 debian-docker, 101 home-assistant"],
      ["hostConfig", "Where your host config copy lives (network, storage.cfg)", "/mnt/usb-backup/pve-host"],
      ["port", "Web UI port", "8006"]] },
    custom: { label: "Custom service", fields: [
      ["composeDir", "Compose folder", "/opt/myapp"],
      ["dataPaths", "Data paths to restore", "/opt/myapp/data"],
      ["restoreSteps", "Your restore steps (one per line)", "Copy data back\nRun docker compose up -d"]] }
  };
  var COMMON = ["id", "type", "name", "hostId", "domain", "version", "backupMethod", "backupLocation", "offsite", "schedule", "lastTested", "secretsWhere", "notes"];
  var HOST_FIELDS = ["id", "name", "ip", "os", "role", "notes"];
  // Restore order: the password manager first (other secrets live there), then the proxy, then apps.
  // Hypervisor first (everything else runs on it), then the password manager, the proxy and the apps.
  var ORDER = { proxmox: 0, vaultwarden: 1, caddy: 2, "home-assistant": 3, "nextcloud-aio": 4, immich: 5, "paperless-ngx": 6, jellyfin: 7, custom: 8 };

  function localDate(d) { d = d || new Date(); function p(n) { return (n < 10 ? "0" : "") + n; } return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function str(v) { return v == null ? "" : String(v).slice(0, MAX_FIELD); }
  function emptyState() { return { schema: SCHEMA, version: SCHEMA_VERSION, lab: { name: "", notes: "" }, hosts: [], services: [], updated: "" }; }
  function newHost(o) { var h = { id: uid(), name: "", ip: "", os: "", role: "", notes: "" }; return Object.assign(h, o || {}); }
  function newService(type, o) {
    if (!TYPES[type]) type = "custom";
    var s = { id: uid(), type: type, name: type === "custom" ? "" : TYPES[type].label, hostId: "", domain: "", version: VERSIONS[type] || "",
      backupMethod: "", backupLocation: "", offsite: "", schedule: "", lastTested: "", secretsWhere: "", notes: "" };
    TYPES[type].fields.forEach(function (f) { s[f[0]] = ""; });
    return Object.assign(s, o || {});
  }

  // --- secret check: flag values that look like real secrets (we only want "where it's stored") ---
  var SECRET_RULES = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
    [/\$argon2(id|i|d)\$/, "Argon2 hash (admin token)"],
    [/(?:^|[^a-zA-Z])(password|passwd|pwd|secret|token|api[_-]?key|passphrase)\s*=\s*\S{4,}/i, "password or token assignment"],
    [/(?:^|[^a-zA-Z])(password|passwd|pwd|secret|token|api[_-]?key|passphrase)\s*:\s*(?=\S*[0-9!@#$%^&*+=?])\S{6,}/i, "password or token"],
    [/\b(ghp_|gho_|github_pat_|glpat-|xox[abp]-|sk-|sk_live_|pk_live_|AKIA)[A-Za-z0-9_\-]{12,}/, "API token"],
    [/\b[A-Fa-f0-9]{32,}\b/, "long hex string"],
    [/(?:^|[^A-Za-z0-9+=_\-])(?=[A-Za-z0-9+_\-]*[0-9])(?=[A-Za-z0-9+_\-]*[A-Z])(?=[A-Za-z0-9+_\-]*[a-z])[A-Za-z0-9+_\-]{32,}={0,2}(?![A-Za-z0-9+=_\-])/, "long random-looking string"]
  ];
  function secretReason(v) {
    v = str(v);
    for (var i = 0; i < SECRET_RULES.length; i++) if (SECRET_RULES[i][0].test(v)) return SECRET_RULES[i][1];
    return "";
  }
  function findSecretLike(state) {
    var hits = [];
    function chk(where, label, v) { var r = secretReason(v); if (r) hits.push({ where: where, field: label, reason: r }); }
    chk("Lab", "notes", state.lab && state.lab.notes);
    (state.hosts || []).forEach(function (h) { HOST_FIELDS.forEach(function (k) { if (k !== "id") chk("Host " + (h.name || "?"), k, h[k]); }); });
    (state.services || []).forEach(function (s) {
      Object.keys(s).forEach(function (k) { if (k !== "id" && k !== "hostId" && k !== "type") chk((s.name || s.type), k, s[k]); });
    });
    return hits;
  }

  // --- import / export ---
  function normalizeHost(h) { var o = newHost(); HOST_FIELDS.forEach(function (k) { if (h && h[k] != null) o[k] = str(h[k]); }); if (!o.id) o.id = uid(); return o; }
  function normalizeService(s) {
    var type = s && TYPES[s.type] ? s.type : "custom", o = newService(type);
    var keys = COMMON.concat(TYPES[type].fields.map(function (f) { return f[0]; }));
    keys.forEach(function (k) { if (s && s[k] != null && k !== "type") o[k] = str(s[k]); });
    if (!o.id) o.id = uid();
    return o;
  }
  function exportPack(state, now) {
    var out = { schema: SCHEMA, version: SCHEMA_VERSION, exportedAt: (now || new Date()).toISOString(),
      note: "Lab Lifeboat recovery data from homelabwise.com/tools/lab-lifeboat/. Should not contain passwords or keys.",
      lab: { name: str(state.lab && state.lab.name), notes: str(state.lab && state.lab.notes) },
      hosts: (state.hosts || []).map(normalizeHost), services: (state.services || []).map(normalizeService) };
    return JSON.stringify(out, null, 2);
  }
  function importPack(text) {
    if (typeof text !== "string") throw new Error("Import needs JSON text.");
    if (text.length > MAX_IMPORT_BYTES) throw new Error("File is too large for a Lab Lifeboat pack (max 1 MB).");
    var d;
    try { d = JSON.parse(text); } catch (e) { throw new Error("This file is not valid JSON."); }
    if (!d || typeof d !== "object" || d.schema !== SCHEMA) throw new Error("This is not a Lab Lifeboat file.");
    if (typeof d.version !== "number" || d.version > SCHEMA_VERSION) throw new Error("This pack was made by a newer Lab Lifeboat. Reload the page to update.");
    var warnings = [], st = emptyState();
    st.lab = { name: str(d.lab && d.lab.name), notes: str(d.lab && d.lab.notes) };
    st.hosts = Array.isArray(d.hosts) ? d.hosts.slice(0, 200).map(normalizeHost) : [];
    var seen = {};
    st.hosts.forEach(function (h) { if (seen[h.id]) h.id = uid(); seen[h.id] = 1; });
    st.services = Array.isArray(d.services) ? d.services.slice(0, 500).map(function (s) {
      if (s && s.type && !TYPES[s.type]) warnings.push("Unknown service type \"" + str(s.type) + "\" imported as a custom service.");
      return normalizeService(s);
    }) : [];
    st.services.forEach(function (s) { if (seen[s.id]) s.id = uid(); seen[s.id] = 1; if (s.hostId && !st.hosts.some(function (h) { return h.id === s.hostId; })) { s.hostId = ""; warnings.push((s.name || s.type) + ": host link not found, cleared."); } });
    var sec = findSecretLike(st);
    if (sec.length) warnings.push(sec.length + " field(s) look like real secrets. Replace them with where the secret is stored.");
    return { state: st, warnings: warnings };
  }

  // --- runbook generator ---
  function ph(v, name) { v = str(v).trim(); return v || "<" + name + ">"; }
  function code(t) { return { code: t }; }
  function hostOf(state, s) { return (state.hosts || []).filter(function (h) { return h.id === s.hostId; })[0] || null; }

  function common(s, state) {
    var h = hostOf(state, s), facts = [];
    facts.push(["Host", h ? (h.name || "(unnamed)") + (h.ip ? " · " + h.ip : "") + (h.os ? " · " + h.os : "") : "(not set)"]);
    if (s.domain) facts.push(["Domain / URL", s.domain]);
    facts.push(["Version to restore", s.version || VERSIONS[s.type] || "(not set)"]);
    facts.push(["Backup method", s.backupMethod || "(not set)"]);
    facts.push(["Backup location", backupLoc(s) || "(not set)"]);
    facts.push(["Offsite copy", s.offsite || "(none recorded)"]);
    if (s.schedule) facts.push(["Schedule", s.schedule]);
    facts.push(["Last restore test", s.lastTested || "never recorded"]);
    facts.push(["Secrets are stored in", s.secretsWhere || "(not recorded)"]);
    return facts;
  }
  function backupLoc(s) { return s.backupLocation || (s.type === "nextcloud-aio" ? s.borgLocation : "") || ""; }
  function warnFor(s) {
    var w = [];
    if (!backupLoc(s)) w.push("No backup location recorded. Without a backup this runbook can only reinstall, not recover data.");
    if (!s.offsite) w.push("No offsite copy recorded. A 3-2-1 plan keeps one copy on another machine or provider.");
    if (!s.lastTested) w.push("No restore test recorded. A backup only counts once you have restored it on a separate machine.");
    if (!s.secretsWhere && s.type !== "jellyfin" && s.type !== "proxmox") w.push("You have not recorded where this service's secrets are kept.");
    return w;
  }

  var BUILD = {
    immich: function (s) {
      var dir = ph(s.composeDir, "COMPOSE_DIR"), up = ph(s.uploadLocation, "UPLOAD_LOCATION"), db = ph(s.dbDataLocation, "DB_DATA_LOCATION"), port = s.port || "2283", v = s.version || VERSIONS.immich;
      return { links: [link("immichBackup"), link("immichInstall"), link("immichRestic"), link("immichCaddy")], sections: [
        { h: "What you need", steps: [
          "A backup of the whole UPLOAD_LOCATION (" + up + "). It holds the backups, encoded-video, library, profile, thumbs and upload folders.",
          "The daily Postgres dumps in " + up + "/backups (Immich keeps the last 14 by default). A dump alone is not a backup of your photos.",
          "Your docker-compose.yml and .env for Immich " + v + ". Restore with the same version as the backup: a different version may need migrations."] },
        { h: "Restore onto a fresh install", steps: [
          "Install Docker and Docker Compose on the new host.",
          "Put docker-compose.yml and .env back in " + dir + ". Check IMMICH_VERSION is " + v + ", and that UPLOAD_LOCATION and DB_DATA_LOCATION point where you want them.",
          "Use a new, empty DB_DATA_LOCATION (" + db + "). Do not copy the old Postgres data folder; the dump restores the database.",
          "Copy the backed-up backups, encoded-video, library, profile, thumbs and upload folders into " + up + ".",
          code("cd " + dir + "\ndocker compose up -d"),
          "Open http://<HOST>:" + port + ". On the welcome screen click Restore from backup. Review the folder integrity checks, then click Next.",
          "Pick a backup from the list, or upload a .sql.gz dump, then click Restore. Immich creates a restore point and rolls back automatically if the restore fails."] },
        { h: "Immich still runs, only the database is broken", steps: [
          "Go to Administration > Maintenance > Restore database backup and click Restore next to the backup you want. This replaces the current database (a restore point is created first)."] },
        { h: "Check it worked", steps: [
          "Log in, compare the asset count with what you expect, open some old originals, play a video, and check albums and faces.",
          "If thumbs or encoded-video were not in the backup, rerun the thumbnail and transcoding jobs.",
          "If Immich sits behind Caddy, restore Caddy next and keep Immich on its own subdomain.",
          "Write down today's date as the last restore test."] },
        { h: "Do not", steps: [
          "Never run docker compose down -v on a server you want to keep: it deletes all Immich data. The command-line restore in the Immich docs starts with it, so use it only on a test machine."] }
      ] };
    },
    vaultwarden: function (s) {
      var dir = ph(s.composeDir, "COMPOSE_DIR"), data = ph(s.dataDir, "DATA_DIR"), c = s.container || "vaultwarden", v = s.version || VERSIONS.vaultwarden;
      return { links: [link("vwBackup"), link("vwInstall"), link("vwErrors")], sections: [
        { h: "What you need", steps: [
          "The database backup: a dated db_*.sqlite3 from /vaultwarden backup (or sqlite3 .backup).",
          "The attachments folder (required if you use attachments). Recommended: config.json and the rsa_key* files. Optional: sends/. The icon_cache can be skipped.",
          "Your docker-compose.yml with the vaultwarden/server:" + v + " image, and your DOMAIN setting.",
          "config.json and rsa_key* can hold secrets in plain text: keep that backup encrypted."] },
        { h: "Restore", steps: [
          code("cd " + dir + "\ndocker compose stop " + c),
          "Move the current " + data + " folder aside (keep it until the restore works), then copy the backup files into " + data + ".",
          "Rename your database backup to db.sqlite3.",
          "If the backup came from /vaultwarden backup, sqlite3 .backup or VACUUM INTO, delete any existing db.sqlite3-wal before starting. A stale WAL file can corrupt the restored database.",
          "If you instead copied db.sqlite3 together with its matching db.sqlite3-wal while the server was idle, restore both. You never need db.sqlite3-shm.",
          code("docker compose up -d"),
          "Log in with a test client and open an item with an attachment."] },
        { h: "Check it worked", steps: [
          "If clients show \"failed to fetch\", check HTTPS and the DOMAIN value (see Vaultwarden errors).",
          "If everyone is logged out, the rsa_key* files were not restored. Users just log in again.",
          "Set the daily backup job up again on the new host: docker exec " + c + " /vaultwarden backup, then copy the files offsite.",
          "Write down today's date as the last restore test."] }
      ] };
    },
    jellyfin: function (s) {
      var dir = ph(s.composeDir, "COMPOSE_DIR"), cfg = ph(s.configDir, "CONFIG_DIR"), cache = ph(s.cacheDir, "CACHE_DIR"), media = ph(s.mediaDirs, "MEDIA_DIRS"), port = s.port || "8096", v = s.version || VERSIONS.jellyfin;
      return { links: [link("jfQsv"), link("jfCaddy"), link("jfTrouble")], sections: [
        { h: "What you need", steps: [
          "A copy of the config folder (" + cfg + ", mounted at /config). With the official image it holds the database, users, settings, watch history and metadata.",
          "Your media files (" + media + "). Media is usually backed up separately from Jellyfin.",
          "The cache folder (" + cache + ") is optional: Jellyfin rebuilds it.",
          "Your docker-compose.yml with the same Jellyfin version (" + v + ")."] },
        { h: "Restore", steps: [
          "Stop Jellyfin if it is running, and only copy the config folder while it is stopped.",
          "Copy the config backup back to " + cfg + " and keep the same owner (the user the container runs as).",
          "Mount the media at the same container paths as before (" + media + "). Libraries store container paths, so changing them breaks the libraries.",
          "If you used Intel Quick Sync, pass through /dev/dri and add the render group again (see Jellyfin Quick Sync in Docker).",
          code("cd " + dir + "\ndocker compose up -d"),
          "Open http://<HOST>:" + port + " and log in."] },
        { h: "Check it worked", steps: [
          "Check users, libraries and watched status, and play one file that needs transcoding.",
          "If playback fails, work through the transcoding checklist.",
          "If Jellyfin sits behind Caddy, restore Caddy next.",
          "Write down today's date as the last restore test."] }
      ] };
    },
    "nextcloud-aio": function (s) {
      var loc = ph(s.borgLocation || s.backupLocation, "BORG_LOCATION"), port = s.aioPort || "8080", v = s.version || VERSIONS["nextcloud-aio"];
      return { links: [link("aioBorg"), link("aioVps")], sections: [
        { h: "What you need", steps: [
          "The Borg backup repository: " + loc + ".",
          "The Borg encryption password shown in the AIO interface. Without it you cannot restore. It must be stored offline: " + (s.secretsWhere || "(record where)") + ".",
          "A host where you can run the same AIO mastercontainer install command (Nextcloud AIO " + v + ")."].concat(s.datadir ? ["Nextcloud data folder: " + s.datadir + ". Make sure the new host has this folder (and enough space) before restoring."] : []) },
        { h: "Restore on the same host", steps: [
          "Open the AIO interface (port " + port + " or 8443), go to Backup and restore and reveal all options.",
          "Pick an archive and click Restore selected backup.",
          "When it finishes, click Start and update containers."] },
        { h: "Restore onto a new server", steps: [
          "Install a fresh AIO mastercontainer with the same install command as before (see Nextcloud AIO on a VPS)" + (s.datadir ? ", including the same NEXTCLOUD_DATADIR (" + s.datadir + ") if you set one" : "") + ".",
          "In Restore AIO instance from backup, enter the backup location (" + loc + ") and the Borg encryption password.",
          "Test the location and password. For an ssh:// remote, add the public key AIO shows to ~/.ssh/authorized_keys on the backup host, then test again. The address must include @ and :.",
          "Select the archive and click Restore selected backup, then Start and update containers.",
          "Point your domain's DNS at the new server if its IP changed."] },
        { h: "Check it worked", steps: [
          "Log in as admin and check files and apps.",
          "Turn daily backups back on, and create a backup before every container update.",
          "Containers or host data outside AIO are not in this backup: restore them separately.",
          "Write down today's date as the last restore test."] }
      ] };
    },
    caddy: function (s) {
      var dir = ph(s.composeDir, "COMPOSE_DIR"), cf = ph(s.caddyfile, "CADDYFILE"), data = ph(s.dataDir, "CADDY_DATA"), conf = ph(s.configDir, "CADDY_CONFIG"), v = s.version || VERSIONS.caddy;
      return { links: [link("immichCaddy"), link("jfCaddy"), link("vwInstall")], sections: [
        { h: "What you need", steps: [
          "Your Caddyfile (" + cf + ") and docker-compose.yml with the caddy:" + v + " image.",
          "The Caddy data folder (" + data + ", mounted at /data). It holds your certificates and ACME account. If you lose it, Caddy requests new certificates, which is fine once but can hit rate limits if repeated.",
          "The config folder (" + conf + ", mounted at /config) is useful but not critical."] },
        { h: "Restore", steps: [
          "Point each domain's A/AAAA records at the new host's public IP" + (s.domain ? " (" + s.domain + ")" : "") + ". Automatic HTTPS needs them in place.",
          "Open TCP 80 and 443 to the host (and UDP 443 if you use HTTP/3).",
          "Copy the Caddyfile and compose file back to " + dir + ", and the data and config folders to their paths.",
          code("cd " + dir + "\ndocker compose up -d\ndocker exec caddy caddy validate --config /etc/caddy/Caddyfile\ndocker logs caddy"),
          "After any Caddyfile edit, reload: docker exec caddy caddy reload --config /etc/caddy/Caddyfile"] },
        { h: "Check it worked", steps: [
          "Open each site over https and check the certificate is valid.",
          "Make sure app ports such as 2283 (Immich) and 8096 (Jellyfin) are not open on the router when Caddy handles HTTPS.",
          "Write down today's date as the last restore test."] }
      ] };
    },
    "home-assistant": function (s) {
      var cfg = ph(s.configDir, "CONFIG_DIR"), port = s.port || "8123", v = s.version || VERSIONS["home-assistant"], it = s.installType || "(record HA OS or Container)";
      return { links: [link("haHw")], sections: [
        { h: "What you need", steps: [
          "A backup file (.tar) from Settings > System > Backups, copied off the device. On HA OS local backups are in /backup; on Container they are in the backups folder of the config folder (" + cfg + ").",
          "The encryption key from the backup emergency kit of the system that made the backup (seven groups of four characters). Backups are encrypted by default and cannot be restored without it. Kept at: " + (s.secretsWhere || "(record where)") + ".",
          "The username and password that were in use when the backup was taken.",
          "Install type: " + it + ". Home Assistant Core at backup time: " + v + ".",
          "Your radios and USB sticks: " + ph(s.radios, "RADIOS") + ".",
          "Not in the backup: an external MariaDB or PostgreSQL database on another system, logs and caches."] },
        { h: "Restore onto a new or reset device (onboarding)", steps: [
          "Install Home Assistant on the target device and open the welcome screen. On HA OS the restore needs internet, at least 2 GB free after the upload, and a healthy system (check the Observer at http://homeassistant.local:4357).",
          "Plug the Zigbee/Z-Wave radios into the new device first.",
          "On the welcome screen select Upload backup, then Select backup file (or Home Assistant Cloud).",
          "Select the parts to restore (everything for a full restore) and enter the emergency-kit encryption key.",
          "Select Restore backup and wait. Do not refresh: \"Not found\" during the restore is normal. A large install can take about 45 minutes.",
          "Log in at http://<HOST>:" + port + " with the credentials from when the backup was taken."] },
        { h: "Restore on the current system", steps: [
          "Settings > System > Backups > Show all backups. To use a file from your computer: three dots menu > Upload backup.",
          "Select the backup, choose what to restore, select Restore, and enter the key if it differs from this system's key."] },
        { h: "Check it worked", steps: [
          "Check dashboards and devices; wake battery-powered devices that show unavailable.",
          "Settings > System > Storage: reconnect any network storage.",
          "If the new device has a different built-in Zigbee radio, migrate Zigbee.",
          "Download the emergency kit again so you hold the current key.",
          "Write down today's date as the last restore test."] }
      ] };
    },
    "paperless-ngx": function (s) {
      var dir = ph(s.composeDir, "COMPOSE_DIR"), ex = ph(s.exportDir, "EXPORT_DIR"), port = s.port || "8000", v = s.version || VERSIONS["paperless-ngx"];
      return { links: [link("plSetup"), link("immichRestic")], sections: [
        { h: "What you need", steps: [
          "The export folder from document_exporter (" + ex + "): documents, thumbnails, manifest.json and the database contents. Make the export when Paperless is not consuming documents.",
          "The export passphrase if you used --passphrase. Without it the export cannot be imported. Kept at: " + (s.secretsWhere || "(record where)") + ".",
          "Your docker-compose.yml and env files for the same Paperless-ngx version (" + v + "). The docs warn an export from one version may not import into another.",
          "Alternative: copies of the Docker volumes (" + ph(s.volumes, "VOLUMES") + ") if you back those up instead of using the exporter."] },
        { h: "Restore with the document importer", steps: [
          "Install the same Paperless-ngx version on the new host with a completely empty database and empty data and media folders.",
          "Copy the export into the export folder of " + dir + ".",
          { code: "cd " + dir + "\ndocker compose up -d\ndocker compose exec webserver document_importer ../export" },
          "If the export was encrypted, add --passphrase to the importer command.",
          "If you backed up volumes instead, restore paperless_media, paperless_data and the database volume, then start the stack."] },
        { h: "Check it worked", steps: [
          "Open http://<HOST>:" + port + ", log in and search for a few documents; open some originals.",
          "API tokens are not in the export: create them again for apps and scanners that use them.",
          { code: "docker compose exec webserver document_sanity_checker" },
          "Write down today's date as the last restore test."] }
      ] };
    },
    proxmox: function (s) {
      var st = ph(s.backupStorage, "BACKUP_STORAGE"), g = ph(s.guests, "VMIDS"), port = s.port || "8006", v = s.version || VERSIONS.proxmox;
      return { links: [link("pveInstall"), link("pveVsUnraid")], sections: [
        { h: "What you need", steps: [
          "Guest backups (vzdump archives) on the backup storage " + st + " — Proxmox Backup Server or a file storage such as NFS.",
          "The list of guests to bring back: " + g + ".",
          "Guest backups do not include the host itself. Keep a copy of the host's network and storage settings: " + ph(s.hostConfig, "HOST_CONFIG") + ".",
          "The Proxmox VE installer ISO for the same major version (" + v + ")."] },
        { h: "Restore the host and guests", steps: [
          "Install Proxmox VE from the ISO (see Install Proxmox VE on a mini PC) and set the same network settings.",
          "Open https://<HOST>:" + port + " and add the backup storage again under Datacenter > Storage > Add (for Proxmox Backup Server you need its address, datastore, credentials and fingerprint).",
          "In the GUI, select the backup storage, open Backups, select a guest's archive and click Restore. Or use the command line:",
          { code: "qmrestore <ARCHIVE> <VMID>      # virtual machines\npct restore <VMID> <ARCHIVE>     # containers" },
          "Start each guest and check it boots."] },
        { h: "Check it worked", steps: [
          "Re-create your backup jobs under Datacenter > Backup.",
          "Then restore the apps inside the guests with their own runbooks (they come later in this pack).",
          "Write down today's date as the last restore test."] }
      ] };
    },
    custom: function (s) {
      var dir = ph(s.composeDir, "COMPOSE_DIR"), own = str(s.restoreSteps).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      return { links: [], sections: [
        { h: "What you need", steps: [
          "Data paths: " + ph(s.dataPaths, "DATA_PATHS") + ".",
          "The compose files in " + dir + " and the image versions you ran" + (s.version ? " (" + s.version + ")" : "") + "."] },
        { h: "Restore", steps: own.length ? own : [
          "Stop the app, copy the data paths back from the backup, then start it again:", code("cd " + dir + "\ndocker compose up -d"),
          "Add your own steps in the editor so this runbook is specific."] },
        { h: "Check it worked", steps: ["Log in and check your data is there.", "Write down today's date as the last restore test."] }
      ] };
    }
  };

  // Readiness score: per service, the checks warnFor() looks at (backup location, offsite copy, restore test, where secrets are kept).
  function readiness(state) {
    var total = 0, passed = 0;
    (state.services || []).forEach(function (s) {
      var n = s.type === "jellyfin" || s.type === "proxmox" ? 3 : 4;  // no secrets check for these two (same as warnFor)
      total += n; passed += n - warnFor(s).length;
    });
    return { total: total, passed: passed, score: total ? Math.round(100 * passed / total) : 0 };
  }

  function generateRunbook(s, state) {
    state = state || emptyState();
    var r = BUILD[TYPES[s.type] ? s.type : "custom"](s);
    return { id: s.id, type: s.type, title: (s.name || TYPES[s.type || "custom"].label) + " recovery runbook", facts: common(s, state), warnings: warnFor(s),
      sections: r.sections, links: r.links, notes: str(s.notes) };
  }
  function generatePack(state, now) {
    var svcs = (state.services || []).slice().sort(function (a, b) { function o(t) { return Object.prototype.hasOwnProperty.call(ORDER, t) ? ORDER[t] : 99; } return o(a.type) - o(b.type); });
    return { title: (state.lab && state.lab.name ? state.lab.name : "My homelab") + " recovery pack", generated: localDate(now), notes: str(state.lab && state.lab.notes),
      hosts: (state.hosts || []).slice(), order: svcs.map(function (s) { return s.name || TYPES[s.type].label; }),
      runbooks: svcs.map(function (s) { return generateRunbook(s, state); }), secretWarnings: findSecretLike(state) };
  }
  function toMarkdown(pack) {
    var L = ["# " + pack.title, "", "Generated " + pack.generated + " with Lab Lifeboat (" + SITE + "/tools/lab-lifeboat/). Contains no passwords or keys.", ""];
    if (pack.notes) L.push(pack.notes, "");
    if (pack.hosts.length) { L.push("## Hosts", "", "| Host | IP | OS | Role |", "|---|---|---|---|");
      pack.hosts.forEach(function (h) { L.push("| " + [h.name, h.ip, h.os, h.role].map(function (x) { return str(x).replace(/\|/g, "\\|"); }).join(" | ") + " |"); }); L.push(""); }
    if (pack.order.length) { L.push("## Restore order", ""); pack.order.forEach(function (n, i) { L.push((i + 1) + ". " + n); }); L.push(""); }
    pack.runbooks.forEach(function (r) {
      L.push("## " + r.title, "");
      r.facts.forEach(function (f) { L.push("- **" + f[0] + ":** " + f[1]); }); L.push("");
      r.warnings.forEach(function (w) { L.push("> Warning: " + w); }); if (r.warnings.length) L.push("");
      r.sections.forEach(function (sec) {
        L.push("### " + sec.h, ""); var n = 0;
        sec.steps.forEach(function (st) { if (st.code) L.push("", "```sh", st.code, "```", ""); else L.push((++n) + ". " + st); }); L.push("");
      });
      if (r.notes) L.push("**Notes:** " + r.notes, "");
      if (r.links.length) { L.push("Guides: " + r.links.map(function (l) { return "[" + l.title + "](" + l.url + ")"; }).join(" · "), ""); }
    });
    return L.join("\n");
  }

  return { SCHEMA: SCHEMA, SCHEMA_VERSION: SCHEMA_VERSION, VERSIONS: VERSIONS, TYPES: TYPES, HOST_FIELDS: HOST_FIELDS, emptyState: emptyState, newHost: newHost,
    newService: newService, secretReason: secretReason, findSecretLike: findSecretLike, exportPack: exportPack, importPack: importPack,
    generateRunbook: generateRunbook, generatePack: generatePack, toMarkdown: toMarkdown, readiness: readiness };
});
