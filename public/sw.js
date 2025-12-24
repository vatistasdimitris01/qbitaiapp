
const CACHE_NAME = 'kipp-cache-v1';
// All local files and the main entry points
const urlsToCache = [
  '/',
  '/index.html',
  'https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png'
];

// On install, cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Use skipWaiting to ensure the new service worker activates immediately.
        self.skipWaiting(); 
        return cache.addAll(urlsToCache);
      })
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        // Take control of all open clients immediately
        return self.clients.claim();
    })
  );
});

// Listen for a message from the client to skip waiting and activate the new SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Only handle http and https requests
  if (!event.request.url.startsWith('http')) {
      return;
  }

  // For all requests, use a network-first, falling-back-to-cache strategy.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // We can only cache successful GET requests.
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If the network fails, try to serve from cache.
        return caches.match(event.request);
      })
  );
});
