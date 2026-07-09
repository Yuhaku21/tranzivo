const CACHE = "tranzivo-v1";

const FILES = [
    "./",
    "./index.html",
    "./kasir.js",
    "./manifest.webmanifest",
    "./icons/logotrazivo-192.png",
    "./icons/logotrazivo-512.png"
];

self.addEventListener("install", e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(FILES))
    );
});

self.addEventListener("fetch", e => {
    e.respondWith(
        caches.match(e.request).then(res => {
            return res || fetch(e.request);
        })
    );
});