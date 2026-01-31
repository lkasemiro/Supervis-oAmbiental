const CACHE_NAME = 'cedae-vistorias-v8'; // Incremente a versão

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './indexedDB.js',
  './roteiros.js',
  './manifest.json',
  './icon.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Ignora requisições de sincronização (POST/NGROK) para não dar conflito com o cache
  if (event.request.method === 'POST' || url.includes('ngrok')) {
    return;
  }

  // ESTRATÉGIA CACHE-FIRST
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Retorna o cache se existir, senão busca na rede
      return cachedResponse || fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          // Salva uma cópia no cache para uso futuro
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    })
  );
});
