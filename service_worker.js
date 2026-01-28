const CACHE_NAME = 'cedae-vistorias-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './indexedDB.js',
  './roteiros.js',
  './manifest.json',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://unpkg.com/leaflet/dist/leaflet.css'
];

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e Limpeza
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

// Estratégia: Stale-While-Revalidate (Corrigida)
self.addEventListener('fetch', (event) => {
  // Ignora requisições POST (Sincronização com R/Server)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Só coloca no cache se a resposta for válida
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Se falhar a rede e não houver cache, você pode retornar uma página offline aqui
        });

        // Retorna o cache IMEDIATAMENTE ou aguarda a rede se o cache estiver vazio
        return cachedResponse || fetchPromise;
      });
    })
  );
});
