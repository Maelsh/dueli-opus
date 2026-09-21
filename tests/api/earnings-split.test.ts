import { describe, expect, it, beforeEach } from 'vitest';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LivePayoutEngine, splitPayoutCents } from '../../src/lib/services/LivePayoutEngine';
import { LedgerService } from '../../src/lib/services/LedgerService';

/**
 * 8.B — الأرباح وحصص المنافسة (RED-FIRST).
 * السياسة الفعلية (لا 70/25/5): 20% منصة + 80% pool حسب التقييمات،
 * والتعادل/غياب التقييمات ⇒ تقاسم متساوٍ للـpool.
 * كل المبالغ integer cents، والتوزيع عبر LedgerService فقط.
 */

async function seedCompetition(db: SqliteD1, opts: { compId: number; creatorId: number; opponentId: number; creatorAvg: number; opponentAvg: number; impressions: number; revenuePerViewCents: number }) {
    await db.prepare(`INSERT INTO users (id, email, username, password_hash, display_name) VALUES (?, ?, ?, 'x', 'U')`)
        .bind(opts.creatorId, `c${opts.creatorId}@t.local`, `c_${opts.creatorId}`).run().catch(() => undefined);
    await db.prepare(`INSERT INTO users (id, email, username, password_hash, display_name) VALUES (?, ?, ?, 'x', 'U')`)
        .bind(opts.opponentId, `c${opts.opponentId}@t.local`, `c_${opts.opponentId}`).run().catch(() => undefined);
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'test', 'ت', 'T')`).run().catch(() => undefined);
    await db.prepare(`INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, creator_rating, opponent_rating, ended_at) VALUES (?, 'T', 'R', 1, ?, ?, 'completed', ?, ?, datetime('now'))`)
        .bind(opts.compId, opts.creatorId, opts.opponentId, opts.creatorAvg, opts.opponentAvg).run();
    const ad = await db.prepare(`INSERT INTO advertisements (title, revenue_per_view, created_by) VALUES ('ad', ?, ?)`)
        .bind(opts.revenuePerViewCents / 100, opts.creatorId).run();
    const adId = ad.meta.last_row_id as number;
    for (let i = 0; i < opts.impressions; i++) {
        await db.prepare(`INSERT INTO ad_impressions (ad_id, competition_id) VALUES (?, ?)`).bind(adId, opts.compId).run();
    }
}

describe('8.B earnings split (RED-FIRST) — real SQL via SqliteD1', () => {
    let db: SqliteD1;

    beforeEach(() => { db = new SqliteD1(); });

    it('pure split: 1000 cents ⇒ sum == 1000 exactly (integer cents)', () => {
        const s = splitPayoutCents(1000, 20, 3, 1);
        expect(Number.isInteger(s.platformCents)).toBe(true);
        expect(Number.isInteger(s.creatorCents)).toBe(true);
        expect(Number.isInteger(s.opponentCents)).toBe(true);
        expect(s.platformCents + s.creatorCents + s.opponentCents).toBe(1000);
    });

    it('pure split: 1001 cents ⇒ sum == 1001 exactly (no cent lost/created)', () => {
        const s = splitPayoutCents(1001, 20, 1, 1);
        expect(s.platformCents + s.creatorCents + s.opponentCents).toBe(1001);
    });

    // ── 8.B §4: مجموعة ≥17 مبلغ غير قابل للقسمة ──────────────────────────
    // كل مبلغٍ يُقسَّم بـ20% منصة + 80% حسب التقييمات؛ التحقق من أن
    // مجموع الحصص = المبلغ الأصلي بالضبط في كل حالة (لا سنت يضيع ولا يُخلق).
    it('≥17 non-divisible amounts: sum of shares == original amount in every case', () => {
        // مبالغ غير قابلة للقسمة على 100 (لوحة متنوعة: فردية، أولية،偶数 غير matrizable، إلخ)
        const amounts = [
            1, 2, 3, 7, 11, 13, // فردية صغيرة
            99, 101, 199, 201, // حول العتبة 100
            333, 667, // تقسيم غير متساوٍ
            1001, 1003, 1007, 1009, // فوق 1000 مع باقٍ
            12345, 67891, // أعداد كبيرة
            999999, // قريب من مليون
            1000001, // فوق مليون BAPاً 하나
            1234567, // عشوائي كبير
            9999999, // تقريبًا عشرة ملايين
        ];
        // متغيرات التقييم والـplatform percentage التي ستفحص:
        const configs: Array<{ pct: number; creator: number; opponent: number }> = [
            { pct: 20, creator: 3, opponent: 1 },
            { pct: 20, creator: 1, opponent: 3 },
            { pct: 20, creator: 1, opponent: 1 },
            { pct: 20, creator: 0, opponent: 0 }, // لا تقييمات
            { pct: 20, creator: 5, opponent: 0 }, // تقييمُ واحد فقط
            { pct: 15, creator: 3, opponent: 1 }, // نسبة منصة مختلفة
            { pct: 25, creator: 4, opponent: 2 }, // نسبة منصة 25%
            { pct: 10, creator: 1, opponent: 0 }, // 10% منصة
            { pct: 33, creator: 2, opponent: 1 }, // 33% منصة (غير صحيح)
            { pct: 50, creator: 1, opponent: 1 }, // 50% منصة
        ];

        for (const amount of amounts) {
            for (const cfg of configs) {
                const s = splitPayoutCents(amount, cfg.pct, cfg.creator, cfg.opponent);
                // كل الحصص صحيحة (integer cents)
                expect(Number.isInteger(s.platformCents)).toBe(true);
                expect(Number.isInteger(s.creatorCents)).toBe(true);
                expect(Number.isInteger(s.opponentCents)).toBe(true);
                // مجموع الحصص = المبلغ الأصلي بالضبط
                const sum = s.platformCents + s.creatorCents + s.opponentCents;
                expect(sum).toBe(amount);
            }
        }
    });

    it('payout goes through LedgerService + idempotent on second run', async () => {
        await seedCompetition(db, { compId: 9001, creatorId: 901, opponentId: 902, creatorAvg: 4, opponentAvg: 2, impressions: 10, revenuePerViewCents: 100 });
        const engine = new LivePayoutEngine(db as unknown as D1Database);
        const first = await engine.finalizePayouts(9001);
        expect(first.finalized).toBe(true);
        const ledger = new LedgerService(db as unknown as D1Database);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);
        const before = (await db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').first<{ n: number }>())?.n ?? 0;
        expect(before).toBeGreaterThan(0);
        // sum of payout shares == original total
        expect(first.platform_share_cents + first.creator_share_cents + first.opponent_share_cents).toBe(first.total_cents);
        const second = await engine.finalizePayouts(9001);
        const after = (await db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').first<{ n: number }>())?.n ?? 0;
        expect(after).toBe(before);
        expect(second.finalized).toBe(true);
    });

    it('draw (equal ratings) ⇒ equal split of the competitor pool', async () => {
        await seedCompetition(db, { compId: 9002, creatorId: 903, opponentId: 904, creatorAvg: 3, opponentAvg: 3, impressions: 10, revenuePerViewCents: 100 });
        const engine = new LivePayoutEngine(db as unknown as D1Database);
        const r = await engine.finalizePayouts(9002);
        expect(r.creator_share_cents).toBe(r.opponent_share_cents);
        expect(r.platform_share_cents + r.creator_share_cents + r.opponent_share_cents).toBe(r.total_cents);
    });

    it('0. PROOF: atomic claim CAS — exactly 1 winner, 9 get 0, no ledger writes', async () => {
        await seedCompetition(db, { compId: 9009, creatorId: 909, opponentId: 910, creatorAvg: 5, opponentAvg: 1, impressions: 10, revenuePerViewCents: 100 });
        // زرع صف واحد غير نهائي ثم إطلاق 10 مطالبات متزامنة على نفس الصف.
        await db.prepare(`INSERT INTO competition_revenue_logs (competition_id, total_ad_revenue, platform_share, creator_share, opponent_share, creator_rating_at_time, opponent_rating_at_time, platform_percentage, finalized) VALUES (?, 10, 2, 4, 4, 5, 1, 20, 0)`).bind(9009).run();
        const { CompetitionRevenueLogModel } = await import('../../src/models/CompetitionRevenueLogModel');
        const model = new CompetitionRevenueLogModel(db as unknown as D1Database);
        const results = await Promise.all(Array.from({ length: 10 }, () => model.claimFinalized(9009)));
        // atomic compare-and-set: فائز واحد فقط، البقية 0.
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(results.filter((v) => !v)).toHaveLength(9);
        // لا قيود مالية إطلاقاً من مجرد المطالبة.
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
    });

    it('0b. PROOF-2: guarded upsert ⇒ single revenue row, single ledger posting', async () => {
        await seedCompetition(db, { compId: 9010, creatorId: 911, opponentId: 912, creatorAvg: 5, opponentAvg: 1, impressions: 10, revenuePerViewCents: 100 });
        const engine = new LivePayoutEngine(db as unknown as D1Database);
        // بعد حارس الإدراج الشرطي: 10 finalizes متزامنة ⇒ صف revenue واحد فقط،
        // مطالبة واحدة ناجحة، وتوزيع ledger واحد.
        await Promise.all(Array.from({ length: 10 }, () => engine.finalizePayouts(9010)));
        const rows = await db.prepare('SELECT id, finalized FROM competition_revenue_logs WHERE competition_id = ? ORDER BY id').bind(9010).all<{ id: number; finalized: number }>();
        const finalizedCount = rows.results.filter((r: { finalized: number }) => r.finalized === 1).length;
        const ledgerN = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(rows.results).toHaveLength(1);
        expect(finalizedCount).toBe(1);
        expect(ledgerN).toBe(4);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('10 concurrent finalizes ⇒ single ledger posting, invariant holds', async () => {
        await seedCompetition(db, { compId: 9003, creatorId: 905, opponentId: 906, creatorAvg: 5, opponentAvg: 1, impressions: 10, revenuePerViewCents: 100 });
        const engine = new LivePayoutEngine(db as unknown as D1Database);
        await Promise.all(Array.from({ length: 10 }, () => engine.finalizePayouts(9003)));
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        // one payout tx posts exactly 4 entries (2 users + platform + reserve)
        expect(n).toBe(4);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('i18n earnings keys exist in ar + en', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['total', 'pending', 'per_competition'] as const) {
            expect((ar as Record<string, Record<string, string>>).earnings?.[k]).toBeTruthy();
            expect((en as Record<string, Record<string, string>>).earnings?.[k]).toBeTruthy();
            expect((ar as Record<string, Record<string, string>>).earnings[k]).not.toBe((en as Record<string, Record<string, string>>).earnings[k]);
        }
    });
});
