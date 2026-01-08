// =============================================
// SERVICE WORKER – PWA CEDAE (Versão Modular Corrigida)
// =============================================

const CACHE_NAME = "cedae-pwa-v12-modular"; 

// Lista de arquivos atualizada (Removido diretório /roteiros/ conforme index.html)
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./indexedDB.js",
  "./manifest.json",
  "./style.css",
  "./icon.png", 
  "./roteiros/roteiro_geral.js", // Caminho corrigido
  "./roteiros/roteiro_pge.js",   // Caminho corrigido
  "./roteiros/roteiro_aa.js"     // Caminho corrigido
];

// INSTALL – Cache agressivo
self.addEventListener("install", (event) => {
  console.log("SW: Instalando nova versão modular...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falha se qualquer URL retornar 404
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ACTIVATE – Limpeza de versões anteriores
self.addEventListener("activate", (event) => {
  console.log("SW: Versão modular ativa.");
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

// FETCH – Estratégia "Cache First" com correção de Clone
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cacheRes) => {
      // 1. Entrega do cache se disponível
      if (cacheRes) return cacheRes;

      // 2. Busca na rede e correção do erro "Response body is already used"
      return fetch(request)
        .then((networkRes) => {
          // Validação básica
          if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') {
            return networkRes;
          }

          // CORREÇÃO: Clonar a resposta ANTES de consumi-la no cache.put
          const responseToCache = networkRes.clone(); 

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkRes;
        })
        .catch((err) => {
          if (request.mode === 'navigate') {
            return caches.match("./index.html");
          }
          console.warn("SW: Recurso não disponível offline:", request.url);
        });
    })
  );
});

// Listener para atualização via interface
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
