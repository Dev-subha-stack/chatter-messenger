const CACHE = 'chatter-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) caches.open(CACHE).then(cache => cache.put('/', res.clone()));
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  if (['script', 'style', 'image', 'font'].includes(req.destination)) {
    event.respondWith(caches.match(req).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    }));
  }
});
