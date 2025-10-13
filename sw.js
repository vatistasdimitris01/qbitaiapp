const CACHE_NAME = 'qbit-cache-v3';
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
  // For navigation requests, we add headers for cross-origin isolation
  // This is required for Pyodide (SharedArrayBuffer).
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          // Use 'credentialless' to allow cross-origin resources without CORP headers
          // as long as they are loaded with the crossorigin="anonymous" attribute.
          newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');

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
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request).then(cachedResponse => {
              // If we find it in cache, we MUST add the headers for COEP to work offline
              if (cachedResponse) {
                  const newHeaders = new Headers(cachedResponse.headers);
                  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
                  newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');

                  return new Response(cachedResponse.body, {
                      status: cachedResponse.status,
                      statusText: cachedResponse.statusText,
                      headers: newHeaders
                  });
              }
              // If not in cache either, it will fail.
              return cachedResponse; 
          });
        })
    );
    return;
  }

  // For all other requests, use a network-first, falling-back-to-cache strategy.
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