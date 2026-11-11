/* Lab Lifeboat service worker: caches the tool so it works offline. Scope is this directory. Sends nothing anywhere. */
var VERSION = "lifeboat-oss-2026-11-11";
var BASE = new URL("./", self.registration.scope).pathname;
var CORE = [BASE, BASE + "index.html", BASE + "core.js", BASE + "app.js", BASE + "lifeboat.css", BASE + "manifest.webmanifest", BASE + "icon-192.png", BASE + "icon-512.png", BASE + "icon-maskable-512.png", BASE + "restore-drill-reminder.ics"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("lifeboat-") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && url.pathname.indexOf(BASE) === 0) {
    // Network first for the page, cache when offline. Cache under the path so query strings do not collide.
    var key = url.pathname;
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok && !r.redirected) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(key, copy); }); }
      return r;
    }).catch(function () { return caches.match(key).then(function (hit) { return hit || caches.match(BASE) || caches.match(BASE + "index.html"); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r.ok && url.pathname.indexOf(BASE) === 0) {
        var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return r;
    });
  }));
});
