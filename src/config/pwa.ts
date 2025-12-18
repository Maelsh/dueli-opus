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
 * خدمة العامل لـ PWA
 */

const CACHE_NAME = 'dueli-v1';
const STATIC_CACHE = 'dueli-static-v1';
const DYNAMIC_CACHE = 'dueli-dynamic-v1';

const STATIC_ASSETS = [
    '/',
    '/static/styles.css',
    '/static/app.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    
    // Skip API requests - network only with offline fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => new Response(
                JSON.stringify({ success: false, error: 'offline' }),
                { headers: { 'Content-Type': 'application/json' } }
            ))
        );
        return;
    }

    // Skip streaming files
    if (url.pathname.includes('.m3u8') || url.pathname.includes('.ts') ||
        url.pathname.includes('.webm') || url.pathname.includes('.mp4')) {
        return;
    }

    // Cache-first for static assets
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            caches.match(request)
                .then(cached => cached || fetch(request).then(response => {
                    return caches.open(STATIC_CACHE).then(cache => {
                        cache.put(request, response.clone());
                        return response;
                    });
                }))
        );
        return;
    }

    // Network-first for pages
    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
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
