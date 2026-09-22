import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

/**
 * FINAL DEBT CLOSURE SWEEP — SEC-04 auth regression lock (docs/12).
 *
 * Implementation status: `src/modules/api/cron/routes.ts` already accepts
 * ONLY `Authorization: Bearer <CRON_SECRET>` on POST (no `?key=`, no GET
 * route, timing-safe compare). This file locks that behavior so no future
 * change can silently reopen the query-string secret or a GET trigger.
 *
 * In-scope per dueli-plan Phase 10 (SEC-04 row test criteria). The remaining
 * SEC-04 operational items (D1 execution lock, run logging) are explicitly
 * OUT of this sweep — see UNPLANNED DEBTS in the sweep report.
 */

const CRON_SECRET = 'cron_test_local_only_sweep';

function env(db: SqliteD1, secret: string | false = CRON_SECRET) {
    const e: Record<string, unknown> = { DB: db };
    if (secret !== false) e['CRON_SECRET'] = secret;
    return e as unknown as Parameters<typeof app.request>[2];
}

function headers() {
    return { 'X-CSRF-Token': 'cron-sweep-test' };
}

async function postRun(
    db: SqliteD1,
    init: { auth?: string; query?: string; secret?: string | false },
) {
    const path = init.query ? `/api/cron/run${init.query}` : '/api/cron/run';
    const h: Record<string, string> = headers();
    if (init.auth !== undefined) h['Authorization'] = init.auth;
    return app.request(path, { method: 'POST', headers: h }, env(db, init.secret));
}

describe('SEC-04 POST /api/cron/run — header-only auth lock', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. no Authorization header ⇒ 403 (never executes)', async () => {
        const res = await postRun(db, {});
        expect(res.status).toBe(403);
    });

    it('2. legacy ?key=<valid-secret> with no Bearer ⇒ 403 (query is ignored)', async () => {
        const res = await postRun(db, { query: `?key=${CRON_SECRET}` });
        expect(res.status).toBe(403);
    });

    it('3. wrong Bearer secret ⇒ 403', async () => {
        const res = await postRun(db, { auth: 'Bearer wrong-secret' });
        expect(res.status).toBe(403);
    });

    it('4. valid Bearer secret ⇒ 200 (gate opens only for the header)', async () => {
        const res = await postRun(db, { auth: `Bearer ${CRON_SECRET}` });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean };
        expect(body.success).toBe(true);
    });

    it('5. GET is not routed (POST-only: browser/crawler navigation cannot trigger)', async () => {
        const res = await app.request(
            `/api/cron/run?key=${CRON_SECRET}`,
            { method: 'GET', headers: headers() },
            env(db),
        );
        expect(res.status).toBe(404);
    });

    it('6. CRON_SECRET not configured ⇒ 503 (not a silent 200)', async () => {
        const res = await postRun(db, { auth: 'Bearer anything', secret: false });
        expect(res.status).toBe(503);
    });
});
