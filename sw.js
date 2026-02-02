const CACHE_NAME = 'cedae-vistorias-v12';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './indexedDB.js',
  './roteiros.js',
  './manifest.json',
  './lib/tailwind.js', 
  './lib/exceljs.min.js'
];

// Instalação: Garante que tudo que é vital está no bolso do técnico
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Fetch com Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // Sincronização (POST) passa direto

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Se a rede falhar, o cachedResponse já será retornado pelo return abaixo
        console.log("Offline: Usando cache para", event.request.url);
      });

      return cachedResponse || fetchPromise;
    })
  );
});