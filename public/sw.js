/**
 * Dueli Service Worker
 * خدمة العامل لـ PWA
 * 
 * Handles caching and offline functionality
 */

const CACHE_NAME = 'dueli-v1';
const STATIC_CACHE = 'dueli-static-v1';
const DYNAMIC_CACHE = 'dueli-dynamic-v1';

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/static/styles.css',
    '/static/app.js',
    '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                        .map(key => caches.delete(key))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip API requests (always network)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(
                    JSON.stringify({ success: false, error: 'Offline' }),
                    { headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // Skip HLS/streaming requests (always network)
    if (url.pathname.includes('.m3u8') || url.pathname.includes('.ts') ||
        url.pathname.includes('.webm') || url.pathname.includes('.mp4')) {
        return;
    }

    // Cache-first for static assets
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    return cached || fetch(request).then(response => {
                        return caches.open(STATIC_CACHE).then(cache => {
                            cache.put(request, response.clone());
                            return response;
                        });
                    });
                })
        );
        return;
    }

    // Network-first for pages
    event.respondWith(
        fetch(request)
            .then(response => {
                // Cache successful responses
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(request).then(cached => {
                    if (cached) return cached;

                    // Return offline page for navigation
                    if (request.mode === 'navigate') {
                        return caches.match('/');
                    }

                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Background sync for uploads (when online)
self.addEventListener('sync', (event) => {
    if (event.tag === 'upload-chunks') {
        console.log('[SW] Syncing uploads...');
        // Handle pending uploads when back online
    }
});

// Push notifications
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || 'New notification',
        icon: '/static/icons/icon-192.png',
        badge: '/static/icons/icon-72.png',
        vibrate: [100, 50, 100],
        data: data.data || {}
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Dueli', options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data.url || '/';
    event.waitUntil(
        clients.openWindow(url)
    );
});

console.log('[SW] Service Worker loaded');
