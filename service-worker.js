// =============================================
// SERVICE WORKER – PWA CEDAE (V13 MAPA OFFLINE)
// =============================================

const CACHE_NAME = "cedae-pwa-v13";
const TILE_CACHE = "cedae-osm-tiles-v1";

// APP SHELL – arquivos essenciais
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./indexedDB.js",
  "./manifest.json",
  "./style.css",
  "./icon.png",
  "./roteiros/roteiro_geral.js",
  "./roteiros/roteiro_pge.js",
  "./roteiros/roteiro_aa.js",

  // Leaflet (necessário offline)
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js"
];

// ---------------------------------------------
// INSTALL
// ---------------------------------------------
self.addEventListener("install", (event) => {
  console.log("SW: Instalando PWA CEDAE V13...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---------------------------------------------
// ACTIVATE
// ---------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("SW: Ativando nova versão...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, TILE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------------------------------------------
// FETCH
// ---------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = request.url;

  if (!url.startsWith("http")) return;

  // -----------------------------------------
  // MAPA OFFLINE – OpenStreetMap Tiles
  // -----------------------------------------
  if (url.includes("tile.openstreetmap.org")) {
    event.respondWith(
      fetch(request)
        .then((networkRes) => {
          const clone = networkRes.clone();
          caches.open(TILE_CACHE).then((cache) => cache.put(request, clone));
          return networkRes;
        })
        .catch(() =>
          caches.open(TILE_CACHE).then((cache) => cache.match(request))
        )
    );
    return;
  }

  // -----------------------------------------
  // APP SHELL – Cache First
  // -----------------------------------------
  event.respondWith(
    caches.match(request).then((cacheRes) => {
      if (cacheRes) return cacheRes;

      return fetch(request)
        .then((networkRes) => {
          if (
            !networkRes ||
            networkRes.status !== 200 ||
            networkRes.type !== "basic"
          ) {
            return networkRes;
          }

          const responseToCache = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkRes;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});

// ---------------------------------------------
// ATUALIZAÇÃO MANUAL
// ---------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
