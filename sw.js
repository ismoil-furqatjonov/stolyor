// Stolyor Service Worker — Versiya 3
const CACHE_NAME = 'stolyor-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './CREDITS.md',
  './data/shops.json',
  './data/shops.js',
  './data/foods.json',
  './data/foods.js',
  './data/drinks.json',
  './data/drinks.js',
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
// data/*.json uchun: Network-First (narxlar va mahsulotlar internet bo'lganda darhol yangilanishi uchun)
// Rasmlar va boshqa resurslar uchun: Cache-First (oflayn ishlash va ultra-tezkor yuklanish uchun)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Faqat GET so'rovlariga xizmat ko'rsatiladi
  if (event.request.method !== 'GET') {
    return;
  }

  // JSON ma'lumotlar uchun: Network-First
  if (requestUrl.pathname.endsWith('.json')) {
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

  // Rasmlar va boshqa statik resurslar uchun: Cache-First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // Rasmlar uchun oflayn fallback
          if (event.request.destination === 'image') {
            return caches.match('./icons/icon-192.png');
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
