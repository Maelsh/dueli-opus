/**
 * B13 — Discovery endpoints resilience (leaderboard / search / explore).
 * Contract: every discovery endpoint answers JSON with Content-Type
 * application/json in all cases — success, empty DB, and DB failure —
 * and never leaks SQL/engine internals to the client.
 */
import { describe, it, expect } from 'vitest';
import app from '../../src/main';
import { translations } from '../../src/i18n';

type Row = Record<string, unknown>;

/**
 * Controllable D1 stub: returns canned rows, or throws a raw SQLite-style
 * error for queries matching the failure marker (simulating a broken query).
 * Unknown statements (rate_limits bookkeeping, etc.) succeed silently.
 */
class StubD1 {
    rows: Row[];
    failMarker: string | null;
    constructor(rows: Row[] = [], failMarker: string | null = null) {
        this.rows = rows;
        this.failMarker = failMarker;
    }
    prepare(sql: string) {
        const self = this;
        const shouldFail = () => self.failMarker !== null && sql.toLowerCase().includes(self.failMarker);
        return {
            sql,
            bind() { return this; },
            async first(): Promise<Row | null> {
                if (shouldFail()) throw new Error('SQLITE_ERROR: no such table: users');
                return self.rows[0] ?? null;
            },
            async all(): Promise<{ results: Row[] }> {
                if (shouldFail()) throw new Error('SQLITE_ERROR: no such table: users');
                return { results: self.rows };
            },
            async run() {
                if (shouldFail()) throw new Error('SQLITE_ERROR: no such table: users');
                return { success: true, meta: { last_row_id: null, changes: 0 } };
            }
        } as unknown as D1PreparedStatement;
    }
    async batch(stmts: D1PreparedStatement[]) {
        const out = [];
        for (const s of stmts) out.push(await (s as unknown as { run(): Promise<unknown> }).run());
        return out as never;
    }
}

const envOf = (db: StubD1) => ({ DB: db } as never);

const LEADER = { id: 1, username: 'top', display_name: 'Top', avatar_url: null, elo_rating: 2100, country: 'US', total_competitions: 4, wins: 3 };

describe('B13: GET /api/leaderboard resilience', () => {
    it('returns 200 + JSON array on a seeded DB', async () => {
        const res = await app.request('/api/leaderboard?lang=en', {}, envOf(new StubD1([LEADER])));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { success: boolean; data: Row[] };
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data[0]?.username).toBe('top');
    });

    it('returns 200 + empty array on an empty DB (no 500)', async () => {
        const res = await app.request('/api/leaderboard?lang=en', {}, envOf(new StubD1([])));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { success: boolean; data: Row[] };
        expect(body.success).toBe(true);
        expect(body.data).toEqual([]);
    });

    it('on query failure: 500 + structured JSON + generic i18n message, no SQL leak', async () => {
        const res = await app.request('/api/leaderboard?lang=en', {}, envOf(new StubD1([], 'elo_rating')));
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toContain('application/json');
        const text = await res.text();
        expect(text).not.toMatch(/sqlite|select|from users|no such table/i);
        const body = JSON.parse(text) as { success: boolean; error: string };
        expect(body.success).toBe(false);
        expect(body.error).toBe(translations.en.errors.service_unavailable);
    });

    it('always answers application/json (Content-Type contract)', async () => {
        for (const db of [new StubD1([LEADER]), new StubD1([]), new StubD1([], 'elo_rating')]) {
            const res = await app.request('/api/leaderboard?lang=en', {}, envOf(db));
            expect(res.headers.get('content-type')).toContain('application/json');
        }
    });
});

describe('B13: search endpoints resilience', () => {
    it('GET /api/search/live: 200 + data on seeded DB', async () => {
        const res = await app.request('/api/search/live?lang=en&limit=5', {}, envOf(new StubD1([LEADER])));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { success: boolean };
        expect(body.success).toBe(true);
    });

    it('GET /api/search/live: 200 + empty data on empty DB', async () => {
        const res = await app.request('/api/search/live?lang=en', {}, envOf(new StubD1([])));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { success: boolean };
        expect(body.success).toBe(true);
    });

    it('GET /api/search/live: 500 + structured JSON + i18n message on query failure', async () => {
        const res = await app.request('/api/search/live?lang=en', {}, envOf(new StubD1([], 'from competitions')));
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toContain('application/json');
        const text = await res.text();
        expect(text).not.toMatch(/sqlite|no such table/i);
        const body = JSON.parse(text) as { success: boolean; error: string };
        expect(body.success).toBe(false);
        expect(body.error).toBe(translations.en.errors.service_unavailable);
    });

    it('GET /api/search/users: 200 + empty results on empty DB', async () => {
        const res = await app.request('/api/search/users?lang=en&q=nomatchuser', {}, envOf(new StubD1([])));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { success: boolean };
        expect(body.success).toBe(true);
    });
});

describe('B13: explore page fallback', () => {
    it('renders a translated error message with a retry button (no blank screen)', async () => {
        const ctx = { get: (k: string) => (k === 'lang' ? 'ar' : null), html: (s: string) => s } as never;
        const { explorePage } = await import('../../src/modules/pages/explore-page');
        const html = (explorePage as (c: never) => string)(ctx);
        expect(html).toContain(translations.ar.errors.service_unavailable);
        expect(html).toContain(translations.ar.discovery.retry);
        expect(html).toContain(translations.ar.discovery.no_results);
    });
});