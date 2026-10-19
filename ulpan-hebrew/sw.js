// LAST service worker of the old GitHub Pages site. It replaces the app's worker in every
// installed copy (same URL, new bytes), throws the old caches away, and answers every
// navigation with the migration page, which sends the visitor to https://ulpan-hebrew.pages.dev.
// Sub-resource requests are left alone: pages still open keep loading from the network.
const CACHE = 'ulpan-migration-1';
const PAGE = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(PAGE)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(PAGE)) || fetch(PAGE);
  })());
});
