const CACHE_NAME = 'cedae-vistorias-v1';

// Pegamos os seus arquivos da lista do PWABuilder e limpamos para o formato padrão
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './indexedDB.js',
  './manifest.json',
  './icon.png',
  './roteiros/roteiro_aa.js',
  './roteiros/roteiro_geral.js',
  './roteiros/roteiro_pge.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://unpkg.com/leaflet/dist/leaflet.css'
];

// Instalação: Salva os arquivos no Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Instalando Cache...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação: Limpa caches antigos
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

// Estratégia: Stale-While-Revalidate
// Carrega do cache primeiro (rápido) e atualiza em segundo plano
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});