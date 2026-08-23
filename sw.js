/* Service worker — mise à jour automatique + support hors-ligne (PWA).
   Stratégie "network-first" : on sert toujours la dernière version quand on est
   en ligne, et on retombe sur le cache seulement hors connexion. */

const CACHE = 'hyrox-cache-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './logo.png', './cat-sprite.png',
  './icon-192.png', './icon-512.png', './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // uniquement le même domaine

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      return cached || caches.match('./index.html');
    }
  })());
});
