/* Lab Lifeboat UI (SLNT Labs). Everything stays in this browser (localStorage). No network requests except the offline cache. */
(function () {
  "use strict";
  var C = window.LifeboatCore, KEY = "hlw-lab-lifeboat-v1", root = document.getElementById("lifeboat");
  if (!C || !root) return;
  var state = load(), saveT = null, packT = null;
  var $ = function (s, el) { return (el || root).querySelector(s); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function load() {
    try { var t = localStorage.getItem(KEY); if (t) return C.importPack(t).state; } catch (e) { /* fall through */ }
    return C.emptyState();
  }
  function save(msg) {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(KEY, C.exportPack(state)); status(msg || "Saved on this device " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); }
      catch (e) { status("Could not save in this browser (private mode?). Export a JSON file to keep your data."); }
    }, 250);
  }
  function status(t) { var el = $("#lb-status"); if (el) el.textContent = t; }

  // ---------- editor ----------
  function field(label, path, val, opts) {
    opts = opts || {};
    var id = "f-" + path.replace(/[^a-z0-9]/gi, "-"), ph = opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "";
    var input = opts.area ? '<textarea id="' + id + '" data-p="' + esc(path) + '" rows="3"' + ph + ">" + esc(val) + "</textarea>"
      : '<input id="' + id + '" data-p="' + esc(path) + '" type="' + (opts.type || "text") + '" value="' + esc(val) + '"' + ph + ' autocomplete="off" spellcheck="false">';
    var flag = C.secretReason(val);
    return '<label class="lb-f' + (opts.wide ? " lb-wide" : "") + '" for="' + id + '"><span>' + esc(label) + "</span>" + input +
      '<small class="lb-flag" role="alert"' + (flag ? "" : " hidden") + ">This looks like a real secret (" + esc(flag) + "). Remove it and write where it is stored instead.</small></label>";
  }
  function hostSelect(s, i) {
    return '<label class="lb-f" for="f-s' + i + '-host"><span>Runs on host</span><select id="f-s' + i + '-host" data-p="services.' + i + '.hostId"><option value="">(choose)</option>' +
      state.hosts.map(function (h) { return '<option value="' + esc(h.id) + '"' + (h.id === s.hostId ? " selected" : "") + ">" + esc(h.name || h.ip || "Unnamed host") + "</option>"; }).join("") + "</select></label>";
  }
  function renderEditor() {
    var ed = $("#lb-editor");
    var hosts = state.hosts.map(function (h, i) {
      return '<details class="lb-item" open><summary>' + esc(h.name || "New host") + (h.ip ? " · " + esc(h.ip) : "") + '</summary><div class="lb-grid">' +
        field("Name", "hosts." + i + ".name", h.name, { ph: "mini-pc" }) + field("IP address", "hosts." + i + ".ip", h.ip, { ph: "192.168.1.10" }) +
        field("OS", "hosts." + i + ".os", h.os, { ph: "Debian 13" }) + field("Role", "hosts." + i + ".role", h.role, { ph: "Docker host" }) +
        field("Notes", "hosts." + i + ".notes", h.notes, { area: true, wide: true, ph: "Disk layout, where it sits, how to reach the console" }) +
        '</div><button type="button" class="lb-btn lb-del" data-act="del-host" data-i="' + i + '">Remove host</button></details>';
    }).join("");
    var svcs = state.services.map(function (s, i) {
      var T = C.TYPES[s.type] || C.TYPES.custom, b = "services." + i + ".";
      return '<details class="lb-item"' + (s._open ? " open" : "") + '><summary>' + esc(s.name || T.label) + ' <span class="tag">' + esc(T.label) + "</span></summary>" +
        '<div class="lb-grid">' + field("Name", b + "name", s.name) + hostSelect(s, i) + field("Domain or URL", b + "domain", s.domain, { ph: "photos.example.com" }) +
        field("Version", b + "version", s.version, { ph: C.VERSIONS[s.type] || "" }) +
        T.fields.map(function (f) { return field(f[1], b + f[0], s[f[0]], { ph: f[2], area: f[0] === "restoreSteps", wide: f[0] === "restoreSteps" }); }).join("") +
        '</div><h4>Backups</h4><div class="lb-grid">' +
        field("Backup method", b + "backupMethod", s.backupMethod, { ph: "restic nightly / AIO Borg daily" }) +
        field("Backup location", b + "backupLocation", s.backupLocation, { ph: "/mnt/usb-backup/immich" }) +
        field("Offsite copy", b + "offsite", s.offsite, { ph: "Backblaze B2 bucket hlw-immich" }) +
        field("Schedule", b + "schedule", s.schedule, { ph: "Daily 03:00" }) +
        field("Last restore test", b + "lastTested", s.lastTested, { type: "date" }) +
        field("Where its secrets are stored (not the secrets)", b + "secretsWhere", s.secretsWhere, { ph: "Vaultwarden item \"Immich .env\"; paper copy in the safe", wide: true }) +
        field("Notes", b + "notes", s.notes, { area: true, wide: true }) +
        '</div><button type="button" class="lb-btn lb-del" data-act="del-svc" data-i="' + i + '">Remove service</button></details>';
    }).join("");
    ed.innerHTML = '<div class="lb-grid">' + field("Lab name", "lab.name", state.lab.name, { ph: "Home lab" }) + field("Lab notes", "lab.notes", state.lab.notes, { area: true, wide: true, ph: "Router login is on the safe sheet; UPS in the closet" }) + "</div>" +
      '<h3>Hosts</h3>' + (hosts || '<p class="lb-empty">No hosts yet.</p>') + '<p><button type="button" class="lb-btn" data-act="add-host">+ Add host</button></p>' +
      '<h3>Services</h3>' + (svcs || '<p class="lb-empty">No services yet. Add the apps you would need to bring back.</p>') +
      '<p class="lb-add"><label for="lb-type" class="sr">Service type</label><select id="lb-type">' +
      Object.keys(C.TYPES).map(function (k) { return '<option value="' + k + '">' + esc(C.TYPES[k].label) + "</option>"; }).join("") +
      '</select> <button type="button" class="lb-btn" data-act="add-svc">+ Add service</button></p>';
  }

  // ---------- pack ----------
  function renderPack() {
    var p = C.generatePack(state), out = $("#lb-pack");
    if (!state.services.length) { out.innerHTML = '<p class="lb-empty">Your recovery pack appears here once you add a service.</p>'; return; }
    var h = '<header class="lb-pack-h"><h2 id="pack">' + esc(p.title) + '</h2><p class="meta">Generated ' + esc(p.generated) +
      " with Lab Lifeboat by SLNT Labs. This pack holds no passwords or keys: it says where they are kept.</p>" + (p.notes ? '<p class="lb-labnotes">' + esc(p.notes) + "</p>" : "") + "</header>";
    var rd = C.readiness(state);
    h += '<p class="lb-ready"><strong>Readiness: ' + rd.score + "%</strong> (" + rd.passed + " of " + rd.total + " checks: backup location, offsite copy, restore test and where secrets are kept). " +
      (rd.passed < rd.total ? "The warnings in each runbook show what is missing." : "Every service has a backup, an offsite copy and a restore test on record.") + "</p>";
    if (p.secretWarnings.length) h += '<p class="note lb-secret">Some fields look like real secrets: ' + p.secretWarnings.map(function (w) { return esc(w.where + " → " + w.field); }).join(", ") + ". Remove them before you print or export.</p>";
    if (p.hosts.length) h += '<h3>Hosts</h3><div class="tbl"><table><thead><tr><th>Host</th><th>IP</th><th>OS</th><th>Role</th><th>Notes</th></tr></thead><tbody>' +
      p.hosts.map(function (x) { return "<tr><td>" + esc(x.name) + "</td><td>" + esc(x.ip) + "</td><td>" + esc(x.os) + "</td><td>" + esc(x.role) + "</td><td>" + esc(x.notes) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    h += '<h3>Restore order</h3><ol class="lb-order">' + p.order.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ol>" +
      '<p class="lb-small">Password manager first (other secrets live there), then the reverse proxy, then the apps.</p>';
    p.runbooks.forEach(function (r) {
      h += '<article class="lb-rb"><h3>' + esc(r.title) + '</h3><dl class="lb-facts">' + r.facts.map(function (f) { return "<dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd>"; }).join("") + "</dl>";
      if (r.warnings.length) h += '<ul class="lb-warns">' + r.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>";
      r.sections.forEach(function (s) {
        var items = [];  // code blocks attach to the step before them, so numbering stays continuous
        s.steps.forEach(function (st) {
          if (st.code) { var pre = '<pre><code>' + esc(st.code) + "</code></pre>"; if (items.length) items[items.length - 1] += pre; else items.push("Run:" + pre); }
          else items.push(esc(st));
        });
        h += "<h4>" + esc(s.h) + "</h4><ol>" + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>";
      });
      if (r.notes) h += '<p><strong>Notes:</strong> ' + esc(r.notes) + "</p>";
      if (r.links.length) h += '<p class="lb-links">Guides: ' + r.links.map(function (l) { return '<a href="' + esc(l.url) + '" rel="noopener">' + esc(l.title) + "</a>"; }).join(" · ") + "</p>";
      h += "</article>";
    });
    out.innerHTML = h;
  }
  function schedulePack() { clearTimeout(packT); packT = setTimeout(renderPack, 200); }

  // ---------- state edits ----------
  function setPath(path, v) {
    var k = path.split("."), o = state;
    for (var i = 0; i < k.length - 1; i++) o = o[k[i]];
    o[k[k.length - 1]] = v;
  }
  root.addEventListener("input", function (e) {
    var p = e.target.getAttribute && e.target.getAttribute("data-p"); if (!p) return;
    setPath(p, e.target.value);
    var fl = e.target.parentNode.querySelector(".lb-flag");
    if (fl) { var r = C.secretReason(e.target.value); fl.hidden = !r; if (r) fl.textContent = "This looks like a real secret (" + r + "). Remove it and write where it is stored instead."; }
    save(); schedulePack();
  });
  root.addEventListener("change", function (e) { if (e.target.tagName === "SELECT" && e.target.getAttribute("data-p")) { setPath(e.target.getAttribute("data-p"), e.target.value); save(); renderPack(); } });
  root.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-act]"); if (!b) return;
    var a = b.getAttribute("data-act"), i = +b.getAttribute("data-i");
    state.services.forEach(function (s) { delete s._open; });
    if (a === "add-host") state.hosts.push(C.newHost());
    else if (a === "del-host" && confirm("Remove this host?")) { var id = state.hosts[i].id; state.hosts.splice(i, 1); state.services.forEach(function (s) { if (s.hostId === id) s.hostId = ""; }); }
    else if (a === "add-svc") { var s = C.newService($("#lb-type").value); if (state.hosts.length === 1) s.hostId = state.hosts[0].id; s._open = true; state.services.push(s); }
    else if (a === "del-svc" && confirm("Remove this service?")) state.services.splice(i, 1);
    else if (a === "export") download(C.exportPack(state), fname("json"), "application/json");
    else if (a === "markdown") download(C.toMarkdown(C.generatePack(state)), fname("md"), "text/markdown");
    else if (a === "print") { renderPack(); window.print(); return; }
    else if (a === "import") { $("#lb-file").click(); return; }
    else if (a === "example") { if (state.services.length && !confirm("Replace what you have with the example lab?")) return; state = example(); }
    else if (a === "erase") { if (!confirm("Erase everything Lab Lifeboat saved in this browser? Export a JSON file first if you want to keep it.")) return; state = C.emptyState(); try { localStorage.removeItem(KEY); } catch (x) { /* ignore */ } }
    else if (a === "install" && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; b.hidden = true; return; }
    else return;
    save(); renderEditor(); renderPack();
  });
  function fname(ext) { return "lab-lifeboat-" + (state.lab.name || "homelab").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "." + ext; }
  function download(text, name, type) {
    var sec = C.findSecretLike(state);
    if (sec.length && !confirm(sec.length + " field(s) look like real secrets. Download anyway?")) return;
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  root.querySelector("#lb-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var r = C.importPack(String(rd.result));
        if (state.services.length && !confirm("Replace your current lab with the imported file?")) { status("Import cancelled."); return; }
        state = r.state; renderEditor(); renderPack();
        save("Imported " + state.services.length + " service(s) and saved on this device." + (r.warnings.length ? " " + r.warnings.join(" ") : ""));
      } catch (err) { status("Import failed: " + err.message); }
      finally { e.target.value = ""; }  // reset so the same file can be picked again
    };
    rd.readAsText(f);
  });
  function example() {
    var st = C.emptyState(); st.lab.name = "Example lab";
    var h = C.newHost({ name: "mini-pc", ip: "192.168.1.10", os: "Debian 13", role: "Docker host" }); st.hosts.push(h);
    st.services.push(C.newService("vaultwarden", { hostId: h.id, domain: "vault.example.com", composeDir: "/opt/vaultwarden", dataDir: "/opt/vaultwarden/vw-data",
      backupMethod: "/vaultwarden backup + rsync, nightly", backupLocation: "/mnt/usb-backup/vaultwarden", offsite: "restic to an offsite VPS", schedule: "Daily 03:00",
      secretsWhere: "Admin token and backup password: printed sheet in the home safe" }));
    st.services.push(C.newService("caddy", { hostId: h.id, domain: "photos.example.com, vault.example.com", composeDir: "/opt/caddy", caddyfile: "/opt/caddy/Caddyfile",
      dataDir: "/opt/caddy/caddy-data", configDir: "/opt/caddy/caddy-config", backupMethod: "Copied with the nightly restic job", backupLocation: "/mnt/usb-backup/caddy" }));
    st.services.push(C.newService("immich", { hostId: h.id, domain: "photos.example.com", composeDir: "/opt/immich", uploadLocation: "/mnt/photos/immich", dbDataLocation: "/opt/immich/postgres",
      backupMethod: "restic, nightly", backupLocation: "/mnt/usb-backup/immich", offsite: "restic to an offsite VPS", schedule: "Daily 03:30",
      secretsWhere: "Vaultwarden item \"Immich .env\"; restic password on the safe sheet" }));
    return st;
  }

  // ---------- offline + install ----------
  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; var b = $("[data-act=install]"); if (b) b.hidden = false; });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { scope: "./" }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () { var o = $("#lb-offline"); if (o) o.textContent = "Ready to work offline"; }).catch(function () { /* no SW: still works online */ });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  function net() { var n = $("#lb-net"); if (n) n.textContent = navigator.onLine ? "" : "You are offline. Everything still works."; }
  window.addEventListener("online", net); window.addEventListener("offline", net);

  // ?add=<type> (from a per-app restore checklist page): add that service once, keep everything already saved.
  var added = null, addMsg = "";
  try {
    var want = new URLSearchParams(location.search).get("add");
    if (want && C.TYPES[want] && want !== "custom") {
      if (state.services.some(function (s) { return s.type === want; })) addMsg = C.TYPES[want].label + " is already in your pack.";
      else { added = C.newService(want); if (state.hosts.length === 1) added.hostId = state.hosts[0].id; added._open = true; state.services.push(added);
        addMsg = "Added " + C.TYPES[want].label + " from the checklist. Fill in your paths and backups; it is saved on this device."; }
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
    }
  } catch (e) { /* old browser: ignore */ }

  root.querySelector(".lb-app").hidden = false;
  renderEditor(); renderPack(); net();
  if (added) { save(addMsg); var d = root.querySelectorAll(".lb-item[open]"); if (d.length) d[d.length - 1].scrollIntoView({ block: "start" }); }
  else if (addMsg) status(addMsg);
  else if (state.services.length) status("Loaded your saved lab from this device.");
})();
