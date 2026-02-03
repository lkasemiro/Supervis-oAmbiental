const CACHE_NAME = 'cedae-vistorias-v18';

// Lista de ativos para cache offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './indexedDB.js',
  './roteiros.js',
  './manifest.json',
  './lib/tailwind.js',
  './lib/exceljs.min.js',
  './icon.png'
];
// 1. Instalação: Salva arquivos essenciais
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando v17...');
  self.skipWaiting(); // Força a nova versão a assumir o controle imediatamente
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos map para que, se um arquivo falhar, os outros ainda sejam cacheados
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => 
          cache.add(url).catch(err => console.error(`[SW] Erro ao cachear ${url}:`, err))
        )
      );
    })
  );
});

// 2. Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando e limpando caches antigos...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Assume o controle das abas abertas na hora
  );
});

// 3. Estratégia Fetch: Stale-While-Revalidate
// Entrega o que está no cache imediatamente e atualiza o cache em segundo plano
self.addEventListener('fetch', (event) => {
  // Ignora requisições que não sejam GET (ex: envio de dados via POST)
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  // Ignora protocolos que não sejam http/https (como extensões ou esquemas chrome-extension)
  if (!url.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Faz a busca na rede em paralelo
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Se a resposta da rede for válida, atualiza o cache
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Se falhar a rede (offline), o navegador usará o cachedResponse automaticamente
          console.log('[SW] Offline: Usando recurso do cache para', url);
        });

        // Retorna o cache se existir, senão espera pela rede
        return cachedResponse || fetchPromise;
      });
    })
  );
});
