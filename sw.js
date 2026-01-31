const CACHE_NAME = 'cedae-vistorias-v7'; // Incrementei para v7 para atualizar o cache

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './indexedDB.js',
  './roteiros.js', // Verifique se o nome é roteiros.js ou se são os arquivos separados
  './manifest.json',
  './icon.png',
  'https://cdn.tailwindcss.com', // Adicionado para garantir o layout offline
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
];

// Instalação: Salva os arquivos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Cache principal aberto');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação: Limpa caches antigos (importante para mudar do ícone verde para o amarelo)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('🗑️ Removendo cache antigo:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Estratégia de Fetch (Rede e Cache)
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. DESVIO DE SINCRONIZAÇÃO (NGROK / API)
  // Não cacheia chamadas de POST ou para o servidor de dados
  if (event.request.method === 'POST' || url.includes('ngrok') || url.includes('vistorias')) {
    return; 
  }

  // 2. FILTRO DE PROTOCOLO
  if (!(url.startsWith('http'))) return;

  // 3. ESTRATÉGIA: Stale-While-Revalidate
  // Responde rápido com o cache, mas atualiza o cache em segundo plano se houver rede
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Atualiza o cache se for uma resposta válida
        if (event.request.method === 'GET' && networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Se a rede falhar, retorna o que tiver no cache
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
