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
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);

        // Modify headers for the browser response.
        const newHeaders = new Headers(networkResponse.headers);
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');

        const responseForBrowser = new Response(networkResponse.body, {
          status: networkResponse.status,
          statusText: networkResponse.statusText,
          headers: newHeaders,
        });

        // Cache the original response before modifying headers for the browser
        if (networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, responseToCache);
        }

        return responseForBrowser;
      } catch (error) {
        // Network failed, try the cache.
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          // If we find it in cache, we MUST add the headers for COEP to work offline
          const newHeaders = new Headers(cachedResponse.headers);
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');

          return new Response(cachedResponse.body, {
              status: cachedResponse.status,
              statusText: cachedResponse.statusText,
              headers: newHeaders
          });
        }
        // If not in cache either, re-throw the error to let the browser handle the failure.
        throw error;
      }
    })());
    return;
  }

  // For all other requests, use a network-first, falling-back-to-cache strategy.
  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(event.request);

      // We can only cache successful GET requests.
      if (networkResponse && networkResponse.ok && event.request.method === 'GET') {
        const responseToCache = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, responseToCache);
      }
      return networkResponse;
    } catch (error) {
      // If the network fails, try to serve from cache.
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      // If not in cache, re-throw to let the browser handle it.
      throw error;
    }
  })());
});