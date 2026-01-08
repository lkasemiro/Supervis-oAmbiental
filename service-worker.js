const CACHE_NAME = "cedae-pwa-v10";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./indexedDB.js",
  "./manifest.json",
  "./style.css",
  "./icon.png", 
 "./roteiros/roteiro_geral.js",
  "./roteiros/roteiro_pge.js",
  "./roteiros/roteiro_aa.js"
];

// INSTALL – Cache agressivo
self.addEventListener("install", (event) => {
  console.log("SW: Instalando nova versão...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos cache.addAll para o núcleo. 
      // DICA: Se um desses arquivos falhar (404), o SW não instala.
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ACTIVATE – Limpeza de cache antigo
self.addEventListener("activate", (event) => {
  console.log("SW: Versão ativa.");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// FETCH – Estratégia "Cache First" com correção de clone
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cacheRes) => {
      // 1. Se está no cache, retorna imediatamente
      if (cacheRes) return cacheRes;

      // 2. Se não está, busca na rede
      return fetch(request)
        .then((networkRes) => {
          // Validação da resposta
          if (!networkRes || networkRes.status !== 200) {
            return networkRes;
          }

          // CORREÇÃO: Clonamos IMEDIATAMENTE antes de qualquer outra ação
          const responseToCache = networkRes.clone();

          // Salvamento assíncrono no cache
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkRes;
        })
        .catch((err) => {
          console.error("SW: Erro na busca (Offline):", err);
          // Fallback para navegação
          if (request.mode === 'navigate') {
            return caches.match("./index.html");
          }
        });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
