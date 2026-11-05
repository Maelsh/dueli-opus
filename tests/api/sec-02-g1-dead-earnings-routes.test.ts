import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';

/**
 * SEC-02-G1 — المسارات الميتة /api/earnings* محذوفة عمداً (قرار قيادي معتمد).
 *
 * الأدلة:
 * - الثلاثة كانوا 500 دائماً (يستعلمون أعمدة غير موجودة في user_earnings)
 *   وصفر مستهلك حي: earnings-page يقرأ /api/withdrawals فقط.
 * - الحذف يشمل كود EarningsModel الميت ومستورد AdminController الميت.
 *
 * العقد الجديد: 404 مقصود لهذه النقاط، و/api/withdrawals + صفحة /earnings
 * تعملان بلا انحدار.
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function authed(token: string, method = 'GET') {
    return { method, headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': 'sec02-g1' } };
}

async function seed(db: SqliteD1): Promise<string> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (1, 'g1@t.local', 'g1_user', 'x', 'G1', 0, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-g1', 1, datetime('now', '+1 day'))`
    ).run();

    const ledger = new LedgerService(db as unknown as D1Database);
    await ledger.post({
        txId: 'test:g1:fund',
        createdBy: 'system:test',
        ref: { ref_type: 'test', ref_id: null },
        entries: [
            { account: 'user:1', direction: 'debit', amountCents: 10_000 },
            { account: 'reserve:payouts', direction: 'credit', amountCents: 10_000 },
        ],
    });
    return 'sess-g1';
}

describe('SEC-02-G1 — dead /api/earnings routes are gone, live wallet/page unaffected', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        // UNIT41.1: open the money/ads gate (closed by default in 0045).
        await db.prepare(`UPDATE platform_settings SET setting_value = '1' WHERE setting_key = 'public_monetization_enabled'`).run();
    });

    it('1. the three deleted earnings endpoints return 404 and move no money', async () => {
        const token = await seed(db);
        const before = (await db.prepare(`SELECT COUNT(*) AS c FROM ledger_entries`)
            .first<{ c: number }>())?.c ?? -1;

        for (const path of ['/api/earnings', '/api/earnings/history', '/api/earnings/competition/1']) {
            const res = await app.request(path, authed(token), env(db));
            expect(res.status, path).toBe(404);
        }

        const after = (await db.prepare(`SELECT COUNT(*) AS c FROM ledger_entries`)
            .first<{ c: number }>())?.c ?? -1;
        expect(after).toBe(before);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('2. /api/withdrawals still returns the ledger wallet and the earnings page still renders', async () => {
        const token = await seed(db);

        const res = await app.request('/api/withdrawals', authed(token), env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            success: boolean;
            data: { wallet: Record<string, number>; requests: unknown[] };
        };
        expect(body.success).toBe(true);
        expect(body.data.wallet).toEqual({
            available: 10_000,
            pending: 0,
            on_hold: 0,
            withdrawn: 0,
            total: 10_000,
        });
        expect(Array.isArray(body.data.requests)).toBe(true);

        const page = await app.request('/earnings?lang=en', {}, env(db));
        expect(page.status).toBe(200);
        const html = await page.text();
        expect(html).toContain('id="earningsContent"');
        expect(html).not.toContain('/api/earnings');
    });
});
