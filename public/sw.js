const CACHE_NAME = 'qbit-cache-v2';
// All local files and the main entry points
const urlsToCache = [
  '/',
  '/index.html',
  'https://raw.githubusercontent.com/vatistasdimitris01/QbitAI/main/public/logo.png'
];

// On install, cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
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
    })
  );
  // Take control of all open clients immediately
  return self.clients.claim();
});

// Listen for a message from the client to skip waiting and activate the new SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Use a "Network falling back to cache" strategy
self.addEventListener('fetch', (event) => {
  // We only want to apply this strategy to GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If the fetch is successful, we clone the response and cache it.
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // We only cache successful responses
          if(response.status === 200) {
            cache.put(event.request, responseToCache);
          }
        });
        return response;
      })
      .catch(() => {
        // If the network request fails (e.g., offline),
        // we try to serve the response from the cache.
        return caches.match(event.request).then((response) => {
            return response;
        });
      })
  );
});