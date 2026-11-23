// Enkel service worker: appen åpner raskt og fungerer med dårlig nett.
// Appfiler hentes fra nett først (så oppdateringer kommer med en gang), ellers fra lager.
const CACHE = 'matdagbok-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'foods.js', 'report.js', 'util.js', 'config.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const isCdn = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.host);
  if (!sameOrigin && !isCdn) return; // Supabase og Matvaretabellen går rett på nett
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isCdn) {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request); if (res.ok) cache.put(e.request, res.clone()); return res;
    }
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request)) || (await cache.match('index.html'));
    }
  })());
});
