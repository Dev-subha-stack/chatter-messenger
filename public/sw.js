const CACHE = 'chatter-shell-v6';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('chatter-shell-') && key !== CACHE).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put('/', response.clone()));
        return response;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => caches.match(request))
    );
  }
});


self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const target = new URL(notification.data?.url || '/', self.location.origin);
  notification.close();

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

