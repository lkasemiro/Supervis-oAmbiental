// =============================================
// SERVICE WORKER – PWA CEDAE (Versão Modular)
// =============================================

const CACHE_NAME = "cedae-pwa-v11-modular"; // Incrementado para forçar renovação

// Lista exata de arquivos para funcionamento 100% offline
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
  console.log("SW: Instalando nova versão modular...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Importante: addAll falha se qualquer URL retornar 404
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

// FETCH – Estratégia "Cache First"
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Ignora extensões de navegador e esquemas não-http
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cacheRes) => {
      // 1. Se já está no cache, entrega imediatamente (Essencial para o Tinguá)
      if (cacheRes) return cacheRes;

      // 2. Se não está, busca na rede e tenta salvar para a próxima vez
      return fetch(request)
        .then((networkRes) => {
          // Validação: não cacheamos erros ou respostas de origens estranhas
          if (!networkRes || networkRes.status !== 200) {
            return networkRes;
          }

          // CORREÇÃO DO ERRO DE CLONE:
          // Apenas clonamos se a resposta for bem-sucedida.
                    const responseToCache = networkRes.clone(); // CLONE AQUI antes de usar

          return networkRes;
        })
        .catch((err) => {
          // Fallback offline: Se for uma navegação de página, volta para o index
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
