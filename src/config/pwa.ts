/**
 * @file src/config/pwa.ts
 * @description PWA Configuration - إعدادات تطبيق الويب التقدمي
 * @module config/pwa
 * 
 * هذا الملف يحتوي على إعدادات PWA (manifest و service worker)
 * ملاحظة: هذه ملفات بنية تحتية وليست محتوى مستخدم
 */

/**
 * PWA Manifest Configuration
 * إعدادات ملف manifest.json
 */
export const pwaManifest = {
    name: "Dueli - منصة التحدي",
    short_name: "Dueli",
    description: "Connect via Competition - تواصل عبر التنافس",
    start_url: "/",
    display: "standalone" as const,
    orientation: "portrait-primary" as const,
    theme_color: "#6366f1",
    background_color: "#0f172a",
    lang: "ar",
    dir: "rtl" as const,
    categories: ["entertainment", "social", "sports"],
    icons: [
        {
            src: "/static/dueli-icon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
        }
    ],
    related_applications: [],
    prefer_related_applications: false
};

/**
 * Service Worker Script Content
 * محتوى ملف Service Worker
 * 
 * ملاحظة: هذا كود JavaScript يعمل في المتصفح
 * لا يمكن استخدام i18n هنا لأنه يعمل خارج سياق التطبيق
 */
export const serviceWorkerScript = `/**
 * Dueli Service Worker
 *
 * NOTE: this copy must stay behaviourally identical to public/sw.js, which is
 * the file Cloudflare Pages actually serves for /sw.js. The test
 * tests/ui/service-worker-cache-lifecycle.test.ts fails if the two drift.
 *
 * Cache lifecycle (2026-09-26 - stale-asset blocker): /static/* used to be
 * cache-first under a FIXED cache name while the asset URLs are unversioned,
 * so a new deployment kept serving the previous bundle (fresh HTML + stale
 * JS/CSS => strict-CSP violations, broken UI, Ctrl+F5 required). Renaming the
 * cache alone would not fix the next deployment, so the strategy is now
 * network-first with a cache fallback, which is version-independent.
 * CSP is untouched: nothing here relaxes or bypasses script/style policy.
 */

const STATIC_CACHE = 'dueli-static-v3';
const DYNAMIC_CACHE = 'dueli-dynamic-v3';
const CURRENT_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];
const DYNAMIC_CACHE_LIMIT = 60;

const STATIC_ASSETS = [
    '/',
    '/static/styles.css',
    '/static/app.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => Promise.all(
                STATIC_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined))
            ))
            .then(() => self.skipWaiting())
    );
});

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

function isCacheable(response) {
    return !!response
        && response.status === 200
        && (response.type === 'basic' || response.type === 'default')
        && response.headers.get('cache-control') !== 'no-store';
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => new Response(
                JSON.stringify({ success: false, error: 'offline' }),
                { headers: { 'Content-Type': 'application/json' } }
            ))
        );
        return;
    }

    if (url.pathname.includes('.m3u8') || url.pathname.includes('.ts') ||
        url.pathname.includes('.webm') || url.pathname.includes('.mp4') ||
        request.headers.has('range')) {
        return;
    }

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
                    return new Response('', { status: 503 });
                }))
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if (isCacheable(response)) {
                    const clone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(request, clone);
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
            .catch(() => caches.match(request).then(cached => {
                if (cached) return cached;
                if (request.mode === 'navigate') return caches.match('/');
                return new Response('', { status: 503 });
            }))
    );
});
`;
