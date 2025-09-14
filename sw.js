const CACHE_NAME = 'qbit-cache-v1';
// All local files and the main entry points
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/services/geminiService.ts',
  '/components/icons.tsx',
  '/components/ChatMessage.tsx',
  '/components/ChatInput.tsx',
  '/components/Sidebar.tsx',
  '/components/SettingsModal.tsx',
  '/components/LocationBanner.tsx',
  '/hooks/useTranslations.ts',
  '/translations.ts',
  'https://raw.githubusercontent.com/vatistasdimitris01/QbitAI/main/public/logo.png'
];

self.addEventListener('install', (event) => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request because it's a stream and can only be consumed once.
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response. We don't cache opaque responses (cross-origin without CORS)
            if (!response || response.status !== 200) {
              return response;
            }

            // Clone the response because it's a stream and can be consumed once.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // We only cache GET requests
                if (event.request.method === 'GET') {
                    cache.put(event.request, responseToCache);
                }
              });

            return response;
          }
        ).catch(err => {
            // Network request failed, try to serve from cache if possible,
            // otherwise, it will fail, which is the expected offline behavior.
            console.log('Fetch failed; returning offline page instead.', err);
        });
      })
  );
});


self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // Delete old caches
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});