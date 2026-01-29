const CACHE_NAME = 'cedae-vistorias-v6';

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
// No seu sw.js
self.addEventListener('fetch', (event) => {
  // FILTRO CRÍTICO: Ignora extensões e esquemas não-http
  if (!(event.request.url.startsWith('http'))) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        return caches.open('v1').then((cache) => {
          
          // SÓ FAZ O PUT SE FOR HTTP/HTTPS
          if (event.request.url.startsWith('http')) {
            cache.put(event.request, fetchResponse.clone());
          }
          
          return fetchResponse;
        });
      });
    })
  );
});
