// sw.js
// ============================================================
// SERVICE WORKER – CEDAE VISTORIAS (OFFLINE + STALE-WHILE-REVALIDATE)
// ============================================================

const CACHE_NAME = 'cedae-vistorias-v29'; // <-- incremente sempre que mudar algo

// Helper: transforma './arquivo' em URL absoluta (chave consistente)
const abs = (path) => new URL(path, self.location).toString();

// Arquivos críticos
const CORE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './camera.js',
  './style.css',
  './indexedDB.js',
  './roteiros.js',
  './manifest.json',
  './lib/tailwind.js',
  './lib/exceljs.min.js',
  './icon.png'
].map(abs);

// Opcionais
const OPTIONAL_ASSETS = [
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
].map(abs);

// 1) INSTALAÇÃO
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      await cache.addAll(CORE_ASSETS);
      console.log('[SW] CORE cache OK.');
    } catch (err) {
      console.error('[SW] Falha ao cachear CORE_ASSETS:', err);
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try { await cache.add(url); }
          catch (e) { console.warn('[SW] CORE falhou:', url, e); }
        })
      );
    }

    await Promise.allSettled(
      OPTIONAL_ASSETS.map(async (url) => {
        try { await cache.add(url); }
        catch (e) { /* opcional */ }
      })
    );
  })());
});

// 2) ATIVAÇÃO
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name !== CACHE_NAME) return caches.delete(name);
    }));
    await self.clients.claim();
    console.log('[SW] Ativo:', CACHE_NAME);
  })());
});

// 3) FETCH
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);
  if (reqUrl.protocol !== 'http:' && reqUrl.protocol !== 'https:') return;

  // não intercepta API
  const isApiLike = reqUrl.pathname.includes('/vistorias/') || reqUrl.pathname.includes('/api/');
  if (isApiLike) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Navegação: network-first, fallback para index.html
    if (event.request.mode === 'navigate') {
      try {
        const network = await fetch(event.request);
        if (network && network.ok) {
          cache.put(abs('./index.html'), network.clone());
        }
        return network;
      } catch (e) {
        const cachedIndex = await cache.match(abs('./index.html'));
        return cachedIndex || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    // Assets: stale-while-revalidate
    const cached = await cache.match(event.request);

    const fetchPromise = (async () => {
      try {
        const network = await fetch(event.request);
        if (network && network.ok && network.type !== 'opaque') {
          cache.put(event.request, network.clone());
        }
        return network;
      } catch {
        return null;
      }
    })();

    if (cached) return cached;

    const network = await fetchPromise;
    return network || new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  })());
});
