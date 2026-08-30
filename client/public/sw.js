const CACHE_NAME = 'shiori-pwa-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/favicon-shiori.png',
  '/icons/shiori-icon.svg'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate Event
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
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First with resilient Fallback
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Only intercept GET requests, skip API, webhooks, and websockets
  if (
    event.request.method !== 'GET' ||
    url.includes('/api/') ||
    url.includes('/socket.io/') ||
    url.includes('chrome-extension:')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return response;
      })
      .catch(async () => {
        // Cache match
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // SPA Navigation Fallback
        if (
          event.request.mode === 'navigate' ||
          (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))
        ) {
          const indexCached = (await caches.match('/index.html')) || (await caches.match('/'));
          if (indexCached) return indexCached;
        }

        // Guaranteed Response fallback (prevents TypeError: Failed to convert value to Response)
        return new Response('Network unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});

// Push Notification Listener
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || 'New development update in SHIORI',
        icon: '/logo.png',
        badge: '/icons/shiori-icon.svg',
        data: {
          url: data.url || '/'
        }
      };
      event.waitUntil(
        self.registration.showNotification(data.title || 'SHIORI Notice', options)
      );
    } catch {}
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/');
      }
    })
  );
});
