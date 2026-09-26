/**
 * Dueli Service Worker
 * خدمة العامل لـ PWA
 *
 * Cache lifecycle (2026-09-26 - stale-asset blocker)
 * ---------------------------------------------------
 * This file used to serve /static/* cache-first under a FIXED cache name
 * ("dueli-static-v2") while the asset URLs themselves are unversioned
 * (/static/app.js, /static/styles.css). A new deployment therefore kept
 * serving the PREVIOUS deployment's bundle, so an ordinary reload combined
 * fresh HTML (new CSP nonce) with stale JS/CSS - which surfaced as strict-CSP
 * violations and a broken UI until a hard refresh (Ctrl+F5).
 *
 * Renaming the cache is NOT the fix: the next deployment would recreate the
 * same trap, because nothing about a cache name changes when only the built
 * assets change. So the fix deliberately does not depend on a version bump:
 *
 *  1. /static/* is NETWORK-FIRST with a cache fallback, so a deployed asset
 *     is always picked up by a normal navigation/reload; the cache is kept
 *     purely as the offline fallback (offline still works).
 *  2. The cached copy is refreshed on every successful network response.
 *  3. Activation keeps only the caches this version owns and deletes the
 *     rest, so a superseded bundle cannot stay active indefinitely.
 *  4. skipWaiting() + clients.claim() let a new worker take over immediately
 *     instead of waiting for every old tab to close.
 *
 * CSP is untouched: nothing here relaxes or bypasses script/style policy.
 */

const STATIC_CACHE = 'dueli-static-v3';
const DYNAMIC_CACHE = 'dueli-dynamic-v3';
const CURRENT_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];
const DYNAMIC_CACHE_LIMIT = 60; // T5.3: cap dynamic entries to avoid unbounded growth

// Assets to warm on install. `cache: 'reload'` bypasses the HTTP cache so an
// install can never capture a stale copy.
const STATIC_ASSETS = [
    '/',
    '/static/styles.css',
    '/static/app.js',
    '/manifest.json'
];

// Install event - warm the static cache, then take over immediately.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => Promise.all(
                STATIC_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))
            ))
            .then(() => self.skipWaiting())
    );
});

// Activate event - drop every cache this version does not own.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => !CURRENT_CACHES.includes(key))
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

/** Only same-origin, non-partial, cacheable responses are ever stored. */
function isCacheable(response) {
    return !!response
        && response.status === 200
        && (response.type === 'basic' || response.type === 'default')
        && response.headers.get('cache-control') !== 'no-store';
}


// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Never intercept cross-origin traffic (CDN fonts/icons): it is not ours to
    // cache, and storing it would make us responsible for a third party.
    if (url.origin !== self.location.origin) return;

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

    // Skip HLS/streaming and range requests (always network)
    if (url.pathname.includes('.m3u8') || url.pathname.includes('.ts') ||
        url.pathname.includes('.webm') || url.pathname.includes('.mp4') ||
        request.headers.has('range')) {
        return;
    }

    // Static assets: network-first, cache as the offline fallback.
    // A newly deployed app.js/styles.css is therefore always used by an
    // ordinary reload; the cache only serves when the network is unavailable.
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (isCacheable(response)) {
                        const copy = response.clone();
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request).then(cached => {
                    if (cached) return cached;
                    return new Response('Offline', { status: 503 });
                }))
        );
        return;
    }

    // Network-first for pages
    event.respondWith(
        fetch(request)
            .then(response => {
                // Cache successful responses
                if (isCacheable(response)) {
                    const clone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(request, clone);
                        // T5.3: trim oldest entries beyond the limit
                        cache.keys().then(keys => {
                            if (keys.length > DYNAMIC_CACHE_LIMIT) {
                                keys.slice(0, keys.length - DYNAMIC_CACHE_LIMIT)
                                    .forEach(k => cache.delete(k));
                            }
                        });
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
