const CACHE_NAME = 'cedae-vistorias-v6';

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

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

// Estratégia de Fetch com Desvio para API
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. DESVIO CRÍTICO: Não interceptar chamadas para o ngrok ou sincronização
  // Isso evita o erro "TypeError: Failed to fetch" no mobile
  if (url.includes('ngrok') || url.includes('sincronizar')) {
    return; // O navegador assume o controle direto da rede
  }

  // 2. FILTRO DE PROTOCOLO (Ignora extensões de navegador)
  if (!(url.startsWith('http'))) return;

  // 3. ESTRATÉGIA DE CACHE (Stale-While-Revalidate para o restante)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Só salva no cache se for uma requisição GET de sucesso
        if (event.request.method === 'GET' && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Se a rede falhar e não houver cache, você pode retornar uma resposta customizada aqui
        return cachedResponse; 
      });

      return cachedResponse || fetchPromise;
    })
  );
});