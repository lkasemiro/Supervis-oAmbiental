// =============================================
// SERVICE WORKER – PWA Modular / cedae-pwa
// =============================================

const CACHE_NAME = "cedae-pwa-v9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app.js",
  "./indexedDB.js",
  "./roteiros.js",
  "./style.css",

  // Ícones e imagens locais
  "./icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png"
];

// INSTALL – Pré-cache da aplicação
self.addEventListener("install", (event) => {
  console.log("SW: instalando…");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((error) => {
        console.error("Falha ao pré-cachear um ou mais recursos:", error);
      });
    })
  );
  self.skipWaiting();
});

// ACTIVATE – Remove caches antigos
self.addEventListener("activate", (event) => {
  console.log("SW: ativado");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("SW: removendo cache antigo:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// FETCH – Cache falling back to network
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (
    request.url.startsWith("chrome-extension") ||
    request.url.startsWith("blob:") ||
    request.url.startsWith("data:")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cacheRes) => {
      if (cacheRes) return cacheRes;

      return fetch(request)
        .then((networkRes) => {
          const cloneable =
            networkRes && networkRes.ok && networkRes.type === "basic";

          if (cloneable) {
            caches.open(CACHE_NAME).then((cache) => {
              try {
                cache.put(request, networkRes.clone());
              } catch (err) {
                console.warn("SW: não foi possível clonar/caches.put:", err);
              }
            });
          }

          return networkRes;
        })
        .catch((err) => {
          console.warn("SW: falha no fetch:", err);
          return caches.match("./index.html");
        });
    })
  );
});

// Mensagens do cliente (para skipWaiting se quiser usar no futuro)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
