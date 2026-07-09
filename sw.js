const CACHE_NAME = 'tranzivo-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/kasir.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
  ,'/icons/logotrazivo.png'
  ,'/icons/logotrazivo.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request).then(r => {
      return caches.open(CACHE_NAME).then(cache => { cache.put(event.request, r.clone()); return r; });
    })).catch(()=>caches.match('/index.html'))
  );
});
