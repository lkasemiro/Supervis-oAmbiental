const CACHE_NAME = "cedae-pwa-v10";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./indexedDB.js",
  "./manifest.json",
  "./style.css",
  "./icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./roteiros/roteiro_geral.js",
  "./roteiros/roteiro_pge.js",
  "./roteiros/roteiro_aa.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
