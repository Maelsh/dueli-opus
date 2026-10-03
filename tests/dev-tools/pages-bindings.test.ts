import { describe, it, expect } from 'vitest';
import {
    checkBindings,
    resolveD1Databases,
    loadConfig,
    PRODUCTION_D1,
} from '../../dev-tools/check-pages-bindings.mjs';

// R-RELEASE-1 preview/production bindings isolation (fail-closed).

const PROD_D1 = [
    { binding: 'DB', database_name: 'dueli-db', database_id: PRODUCTION_D1.database_id },
];

describe('pages bindings isolation gate', () => {
    it('production target resolves exactly the pinned production D1', () => {
        const r = checkBindings({ d1_databases: PROD_D1 }, 'production');
        expect(r.ok).toBe(true);
        expect(r.info.d1_count).toBe(1);
    });

    it('preview with explicit empty env override resolves zero D1 (pass)', () => {
        const r = checkBindings({ d1_databases: PROD_D1, env: { preview: { d1_databases: [] } } }, 'preview');
        expect(r.ok).toBe(true);
        expect(r.info.d1_count).toBe(0);
    });

    it('preview without an override inherits production D1 (fail-closed)', () => {
        const r = checkBindings({ d1_databases: PROD_D1 }, 'preview');
        expect(r.ok).toBe(false);
        expect(r.failures.join(' ')).toMatch(/zero|inherit/i);
    });

    it('preview resolving the production database_id fails', () => {
        const r = checkBindings(
            { d1_databases: [], env: { preview: { d1_databases: PROD_D1 } } },
            'preview'
        );
        expect(r.ok).toBe(false);
        expect(r.failures.join(' ')).toContain(PRODUCTION_D1.database_id);
    });

    it('production with a wrong database fails', () => {
        const r = checkBindings(
            { d1_databases: [{ binding: 'DB', database_name: 'dueli-db', database_id: 'other-id' }] },
            'production'
        );
        expect(r.ok).toBe(false);
    });

    it('unknown target fails', () => {
        expect(checkBindings({ d1_databases: PROD_D1 }, 'staging').ok).toBe(false);
        expect(checkBindings({ d1_databases: PROD_D1 }, '').ok).toBe(false);
    });

    it('missing config file fails (throw, never silent pass)', () => {
        expect(() => loadConfig('does/not/exist.jsonc')).toThrow();
    });

    it('env override replaces top-level (resolution rule)', () => {
        const other = [{ binding: 'DB', database_name: 'preview-db', database_id: 'preview-id' }];
        expect(resolveD1Databases({ d1_databases: PROD_D1, env: { preview: { d1_databases: other } } }, 'preview')).toEqual(
            other
        );
        expect(resolveD1Databases({ d1_databases: PROD_D1 }, 'preview')).toEqual(PROD_D1);
    });

    it('real wrangler.jsonc passes both targets', () => {
        const config = loadConfig('wrangler.jsonc');
        const prod = checkBindings(config, 'production');
        const preview = checkBindings(config, 'preview');
        expect(prod.ok).toBe(true);
        expect(preview.ok).toBe(true);
        expect(preview.info.d1_count).toBe(0);
    });
});
