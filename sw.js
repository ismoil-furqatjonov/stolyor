// Stolyor Service Worker
// Versiya yangilanganida kesh nomini o'zgartiring (masalan: 'stolyor-v2')
const CACHE_NAME = 'stolyor-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './data/shops.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// O'rnatish: statik fayllarni keshga yozish
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Faollashtirish: eski keshlarni tozalash
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// So'rovlarni tutish:
// data/shops.json uchun: Network-First (narxlar va do'konlar internet bo'lganda darhol yangilanishi uchun)
// Boshqa resurslar uchun: Cache-First (oflayn ishlash va tezkor yuklanish uchun)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Faqat GET so'rovlariga xizmat ko'rsatiladi
  if (event.request.method !== 'GET') {
    return;
  }

  if (requestUrl.pathname.endsWith('shops.json')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Boshqa barcha statik resurslar uchun Cache-first
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});

