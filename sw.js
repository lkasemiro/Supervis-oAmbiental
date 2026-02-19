// sw.js
// ============================================================
// SERVICE WORKER – CEDAE VISTORIAS (OFFLINE + STALE-WHILE-REVALIDATE)
// ============================================================

const CACHE_NAME = 'cedae-vistorias-v25';

// Arquivos críticos (não podem falhar)
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
];

// Arquivos opcionais (se falhar, não impede instalação)
const OPTIONAL_ASSETS = [
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// 1) INSTALAÇÃO
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  self.skipWaiting();

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // 1.1 Cache dos arquivos críticos (se falhar aqui, algo estrutural está errado)
    try {
      await cache.addAll(CORE_ASSETS);
      console.log('[SW] CORE cache OK.');
    } catch (err) {
      console.error('[SW] Falha ao cachear CORE_ASSETS:', err);
      // Ainda tenta cache parcial do core, sem abortar o SW
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try { await cache.add(url); }
          catch (e) { console.warn(`[SW] CORE falhou: ${url}`, e); }
        })
      );
    }

    // 1.2 Cache dos opcionais (nunca pode quebrar)
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(async (url) => {
        try {
          await cache.add(url);
          console.log('[SW] Opcional cacheado:', url);
        } catch (e) {
          console.warn('[SW] Opcional ausente/erro:', url, e);
        }
      })
    );

  })());
});

// 2) ATIVAÇÃO
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando e limpando caches antigos...');
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((name) => {
        if (name !== CACHE_NAME) return caches.delete(name);
      })
    );
    await self.clients.claim();
  })());
});

// 3) FETCH – Stale-While-Revalidate + fallback navegação
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);
  if (reqUrl.protocol !== 'http:' && reqUrl.protocol !== 'https:') return;

  // Não intercepta endpoints de sync (mesmo se no futuro virar GET)
  const isApiLike = reqUrl.pathname.includes('/vistorias/') || reqUrl.pathname.includes('/api/');
  if (isApiLike) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Navegação (SPA/PWA): sempre cai pro index offline
    if (event.request.mode === 'navigate') {
      try {
        const network = await fetch(event.request);
        if (network && network.ok) {
          cache.put('./index.html', network.clone());
        }
        return network;
      } catch (_) {
        const cachedIndex = await cache.match('./index.html');
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
      } catch (_) {
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
