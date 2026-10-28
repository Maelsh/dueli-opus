/**
 * UNIT34 — isolate-level public cache must not leak across unrelated tests.
 */
import { beforeEach } from 'vitest';
import { clearPublicSurfaceCache } from '../src/lib/services/PublicSurfaceCache';

beforeEach(() => {
    clearPublicSurfaceCache();
});
