const CACHE_NAME = 'recoder-agents-v3';
const STATIC_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests
  if (url.pathname.startsWith('/api/')) return;

  // Skip external/cross-origin URLs entirely — let the browser handle them
  // This prevents CSP and network error issues with third-party resources
  // (e.g., js.stripe.com, logos.composio.dev, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip Next.js HMR and webpack dev requests
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // Cache-first for static assets
  if (url.pathname.match(/\.(js|css|woff2|png|svg|ico|jpg|jpeg|webp|avif)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // Return cached version if available, otherwise a proper error response
            return caches.match(event.request).then((cached) => {
              return cached || new Response('Service Unavailable', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({ 'Content-Type': 'text/plain' }),
              });
            });
          });
      })
    );
    return;
  }

  // Network-first for page navigations
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Return cached version if available, otherwise a proper error response
        return caches.match(event.request).then((cached) => {
          return cached || new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});
