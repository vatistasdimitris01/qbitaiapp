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

const handleFetch = async (event) => {
  // For navigation requests (loading the main HTML page)
  if (event.request.mode === 'navigate') {
    try {
      const networkResponse = await fetch(event.request);
      
      const newHeaders = new Headers(networkResponse.headers);
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
      newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
      
      const responseToCache = networkResponse.clone();
      
      caches.open(CACHE_NAME).then(cache => {
        if (responseToCache.status === 200) {
          cache.put(event.request, responseToCache);
        }
      });
      
      return new Response(networkResponse.body, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      // Network failed, try the cache
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        const newHeaders = new Headers(cachedResponse.headers);
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');

        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers: newHeaders,
        });
      }
      return new Response("You are offline.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  // For all other requests (assets like scripts, css, images)
  try {
    const networkResponse = await fetch(event.request);
    if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
      const responseToCache = networkResponse.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, responseToCache);
      });
    }
    return networkResponse;
  } catch (error) {
    // If the network fails, try to serve from the cache.
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // If not in cache, return an error response to prevent crashes.
    return new Response(`Resource not available offline: ${event.request.url}`, {
      status: 404,
      statusText: "Not Found",
      headers: { "Content-Type": "text/plain" },
    });
  }
};

self.addEventListener('fetch', (event) => {
  event.respondWith(handleFetch(event));
});
