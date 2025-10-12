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

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  // For navigation requests, we add headers for cross-origin isolation
  // This is required for Pyodide (SharedArrayBuffer).
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

          // Cache the original response before modifying headers for the browser
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
              if(responseToCache.status === 200) {
                cache.put(event.request, responseToCache);
              }
          });

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch(() => caches.match(event.request)) // Fallback to cache if network fails
    );
    return;
  }

  // For other GET requests, use a network-falling-back-to-cache strategy
  // with a special case for cross-origin resources to handle COEP.
  if (event.request.method === 'GET') {
    const requestUrl = new URL(event.request.url);

    // For cross-origin requests, create a new request with 'no-cors' mode.
    // For same-origin requests, use the original request.
    const fetchRequest = requestUrl.origin !== self.location.origin
      ? new Request(event.request, { mode: 'no-cors' })
      : event.request;

    event.respondWith(
      fetch(fetchRequest)
        .then((response) => {
          // If the fetch is successful, clone the response and cache it.
          // This works for regular and opaque (no-cors) responses.
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // If the network request fails, serve from the cache.
          return caches.match(event.request);
        })
    );
  }
});
