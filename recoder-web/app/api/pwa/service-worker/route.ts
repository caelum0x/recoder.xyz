import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const strategy = searchParams.get('strategy') || 'networkFirst';
    const offlinePages = searchParams.get('offlinePages') || 'essential';

    // Generate service worker with dynamic caching strategies
    const serviceWorkerCode = generateServiceWorker(strategy, offlinePages);

    return new NextResponse(serviceWorkerCode, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=86400', // 24 hours
        'Service-Worker-Allowed': '/'
      }
    });
  } catch (error) {
    console.error('Failed to generate service worker:', error);
    return NextResponse.json(
      { error: 'Failed to generate service worker' },
      { status: 500 }
    );
  }
}

function generateServiceWorker(strategy: string, offlinePages: string): string {
  return `
// Recoder.xyz Service Worker - Dynamic Generation
const CACHE_NAME = 'recoder-v${Date.now()}';
const OFFLINE_CACHE = 'recoder-offline-v1';
const RUNTIME_CACHE = 'recoder-runtime-v1';

// Cache strategies configuration
const CACHE_STRATEGIES = {
  networkFirst: '${strategy}' === 'networkFirst',
  cacheFirst: '${strategy}' === 'cacheFirst',
  staleWhileRevalidate: '${strategy}' === 'staleWhileRevalidate'
};

// Essential assets to cache
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/manifest-icon-192.png',
  '/icons/manifest-icon-512.png',
  ${offlinePages === 'full' ? `
  '/projects',
  '/generate',
  '/analytics',
  '/settings'
  ` : `
  // Essential pages only
  `}
];

// API endpoints to cache with different strategies
const API_CACHE_PATTERNS = [
  { pattern: /\\/api\\/projects/, strategy: 'networkFirst', ttl: 300000 }, // 5 min
  { pattern: /\\/api\\/analytics/, strategy: 'staleWhileRevalidate', ttl: 600000 }, // 10 min
  { pattern: /\\/api\\/user/, strategy: 'networkFirst', ttl: 180000 }, // 3 min
  { pattern: /\\/api\\/generate/, strategy: 'networkOnly' }, // Always fresh
  { pattern: /\\/api\\/health/, strategy: 'networkOnly' } // Always check
];

// Background sync queue
let syncQueue = [];

// Install event - precache essential assets
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching precache assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Skip waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('Service Worker: Install failed', err);
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== OFFLINE_CACHE && cacheName !== RUNTIME_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-HTTP requests
  if (!request.url.startsWith('http')) return;
  
  // Skip Chrome extension requests
  if (url.origin.includes('chrome-extension')) return;
  
  // Handle API requests with specific strategies
  const apiPattern = API_CACHE_PATTERNS.find(pattern => pattern.pattern.test(url.pathname));
  if (apiPattern) {
    event.respondWith(handleApiRequest(request, apiPattern));
    return;
  }
  
  // Handle static assets
  if (request.destination === 'image' || request.destination === 'script' || request.destination === 'style') {
    event.respondWith(handleStaticAsset(request));
    return;
  }
  
  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  
  // Default handling
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match('/offline');
    })
  );
});

// Handle API requests with different strategies
async function handleApiRequest(request, config) {
  const cacheName = RUNTIME_CACHE;
  const cache = await caches.open(cacheName);
  
  switch (config.strategy) {
    case 'networkFirst':
      return networkFirst(request, cache, config.ttl);
    case 'cacheFirst':
      return cacheFirst(request, cache, config.ttl);
    case 'staleWhileRevalidate':
      return staleWhileRevalidate(request, cache, config.ttl);
    case 'networkOnly':
    default:
      return networkOnly(request);
  }
}

// Network First strategy
async function networkFirst(request, cache, ttl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      cache.put(request, responseClone);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Queue for background sync if this is a POST/PUT/DELETE
    if (request.method !== 'GET') {
      queueBackgroundSync(request);
    }
    throw error;
  }
}

// Cache First strategy
async function cacheFirst(request, cache, ttl) {
  const cached = await cache.match(request);
  if (cached) {
    const cacheTime = parseInt(cached.headers.get('sw-cache-time') || '0');
    if (Date.now() - cacheTime < ttl) {
      return cached;
    }
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const modifiedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      cache.put(request, modifiedResponse);
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

// Stale While Revalidate strategy
async function staleWhileRevalidate(request, cache, ttl) {
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });
  
  return cached || fetchPromise;
}

// Network Only strategy
async function networkOnly(request) {
  return fetch(request);
}

// Handle static assets with cache first strategy
async function handleStaticAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('Failed to fetch static asset:', request.url);
    throw error;
  }
}

// Handle navigation requests
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Return offline page for navigation failures
    const cache = await caches.open(CACHE_NAME);
    const offlinePage = await cache.match('/offline');
    return offlinePage || new Response('Offline - Please check your connection', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Background sync for failed requests
function queueBackgroundSync(request) {
  const syncData = {
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body: request.body,
    timestamp: Date.now()
  };
  
  syncQueue.push(syncData);
  
  // Register background sync
  self.registration.sync.register('recoder-background-sync').catch(err => {
    console.error('Background sync registration failed:', err);
  });
}

// Background sync event
self.addEventListener('sync', event => {
  if (event.tag === 'recoder-background-sync') {
    event.waitUntil(processSyncQueue());
  }
});

// Process background sync queue
async function processSyncQueue() {
  const queue = [...syncQueue];
  syncQueue = [];
  
  for (const item of queue) {
    try {
      const request = new Request(item.url, {
        method: item.method,
        headers: new Headers(item.headers),
        body: item.body
      });
      
      const response = await fetch(request);
      
      if (response.ok) {
        console.log('Background sync successful:', item.url);
        
        // Notify clients of successful sync
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'BACKGROUND_SYNC_SUCCESS',
              url: item.url,
              timestamp: Date.now()
            });
          });
        });
      } else {
        throw new Error(\`Background sync failed: \${response.status}\`);
      }
    } catch (error) {
      console.error('Background sync failed:', item.url, error);
      
      // Requeue if not too old (24 hours)
      if (Date.now() - item.timestamp < 86400000) {
        syncQueue.push(item);
      }
      
      // Notify clients of failed sync
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'BACKGROUND_SYNC_FAILED',
            url: item.url,
            error: error.message,
            timestamp: Date.now()
          });
        });
      });
    }
  }
}

// Push notification event
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  
  let notificationData = {
    title: 'Recoder.xyz',
    body: 'You have a new notification',
    icon: '/icons/manifest-icon-192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'recoder-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icons/action-open.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/action-dismiss.png'
      }
    ],
    data: {
      url: '/',
      timestamp: Date.now()
    }
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.error('Error parsing push data:', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data || {};
  
  if (action === 'dismiss') {
    return;
  }
  
  const urlToOpen = action === 'open' ? (data.url || '/') : '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      // Check if there's already a window open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// Message event - handle messages from clients
self.addEventListener('message', event => {
  console.log('Service Worker received message:', event.data);
  
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_URLS':
      event.waitUntil(
        caches.open(RUNTIME_CACHE).then(cache => {
          return cache.addAll(payload.urls);
        })
      );
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.keys().then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        })
      );
      break;
      
    default:
      console.log('Unknown message type:', type);
  }
});

// Performance monitoring
const performanceObserver = {
  observe: () => {
    // Monitor cache hits and misses
    let cacheHits = 0;
    let cacheMisses = 0;
    
    const originalMatch = caches.match;
    caches.match = async function(...args) {
      const result = await originalMatch.apply(this, args);
      if (result) {
        cacheHits++;
      } else {
        cacheMisses++;
      }
      
      // Send metrics to clients periodically
      if ((cacheHits + cacheMisses) % 10 === 0) {
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'PERFORMANCE_METRICS',
              data: {
                cacheHits,
                cacheMisses,
                cacheHitRatio: cacheHits / (cacheHits + cacheMisses),
                timestamp: Date.now()
              }
            });
          });
        });
      }
      
      return result;
    };
  }
};

// Initialize performance monitoring
performanceObserver.observe();

console.log('Recoder.xyz Service Worker loaded with strategy:', '${strategy}');
`;
}

// POST method to register service worker with custom configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      cacheStrategy = 'networkFirst',
      offlinePages = 'essential',
      pushEndpoint,
      notificationSettings
    } = body;

    // Store service worker configuration in database or cache
    // This would typically be stored per user
    
    const config = {
      cacheStrategy,
      offlinePages,
      pushEndpoint,
      notificationSettings,
      registeredAt: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      config,
      serviceWorkerUrl: `/api/pwa/service-worker?strategy=${cacheStrategy}&offlinePages=${offlinePages}`
    });
  } catch (error) {
    console.error('Failed to configure service worker:', error);
    return NextResponse.json(
      { error: 'Failed to configure service worker' },
      { status: 500 }
    );
  }
}