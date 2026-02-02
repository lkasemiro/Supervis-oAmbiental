const CACHE_NAME = 'cedae-vistorias-v14'; 
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

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação: Limpa caches antigos (Boa prática!)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch com filtro de extensão
self.addEventListener('fetch', (event) => {
  // 1. Ignora POST (Sincronização) e outros métodos
  if (event.request.method !== 'GET') return;

  // 2. FILTRO CRÍTICO: Ignora extensões e protocolos não-web (Corrige seu erro)
  const url = event.request.url;
  if (!url.startsWith('http')) return; 

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        console.log("Offline: Usando cache para", url);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
