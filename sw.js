const CACHE_NAME = 'coil-tools-pwa-v5';
const APP_ASSETS = [
  './',
  './index.html',
  './winding-calibrator.html',
  './coil-designer.html',
  './coil-calibrator.html',
  './watchtower.html',
  './ect-designer.html',
  './manifest.webmanifest',
  './manifest-wc.webmanifest',
  './manifest-cd.webmanifest',
  './manifest-cc.webmanifest',
  './manifest-ectd.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-wc.svg',
  './icons/icon-wc-180.png',
  './icons/icon-wc-192.png',
  './icons/icon-wc-512.png',
  './icons/icon-cd.svg',
  './icons/icon-cd-180.png',
  './icons/icon-cd-192.png',
  './icons/icon-cd-512.png',
  './icons/icon-cc.svg',
  './icons/icon-cc-180.png',
  './icons/icon-cc-192.png',
  './icons/icon-cc-512.png',
  './icons/icon-ectd.svg',
  './icons/icon-ectd-180.png',
  './icons/icon-ectd-192.png',
  './icons/icon-ectd-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
