/**
 * UNIT34-C — bounded in-isolate TTL cache for public, non-personalized reads.
 * Keys isolate surface/category/subcategory/status/lang/policy_version.
 */

const DEFAULT_TTL_MS = 15_000;

type Entry<T> = { expiresAt: number; value: T };

const store = new Map<string, Entry<unknown>>();

export function buildPublicCacheKey(parts: Record<string, string>): string {
    const keys = Object.keys(parts).sort();
    return keys.map((k) => `${k}=${parts[k]}`).join('\0');
}

export function getPublicCache<T>(key: string): T | undefined {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return hit.value as T;
}

export function setPublicCache<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    store.set(key, { expiresAt: Date.now() + ttlMs, value });
}

/** Tests and critical transitions (e.g. status finalize hooks) may clear the isolate cache. */
export function clearPublicSurfaceCache(): void {
    store.clear();
}
