const CACHE_NAME = 'cedae-vistorias-v16';
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

// Instalação: Tenta cachear, mas não trava se um arquivo falhar
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força o novo SW a assumir o controle
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos map para capturar erros individualmente e não derrubar o SW todo
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => 
          cache.add(url).catch(err => console.error(`Falha ao cachear: ${url}`, err))
        )
      );
    })
  );
});

// Ativação: Limpa caches e assume controle total das abas abertas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim()) // Faz o SW controlar a página imediatamente
  );
});

// Fetch: Estratégia Stale-While-Revalidate (Entrega rápido, atualiza no fundo)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  if (!url.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse); // Se cair a rede e não tiver cache, retorna o que der

        // Retorna o cache IMEDIATAMENTE ou espera a rede se estiver vazio
        return cachedResponse || fetchPromise;
      });
    })
  );
});
