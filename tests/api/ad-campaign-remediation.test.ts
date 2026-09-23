import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { AdminAuditLogModel } from '../../src/models/AdminAuditLogModel';
import { AdCampaignManager } from '../../src/lib/services/AdCampaignManager';

/**
 * Phase 9.A remediation — F-1 migration safety probe + F-3 admin workflow.
 *
 * F-1: a production-like database (advertisements + ad_impressions + ad_blocks
 * + platform_financial_logs references) goes through the 0025 lifecycle
 * migration additive-only (no DROP): rows, child rows and FK relations are
 * preserved, values backfilled to integer cents, depleted/archived → ended.
 * Concretely proves the REMOTE-flagged data-loss path (DROP TABLE with FK
 * enforcement ON would cascade-delete ad_impressions/ad_blocks) no longer
 * exists: nothing in 0025 drops or moves any row, and 0025 is the ONLY 9.A
 * migration — a parallel carry-over file was removed because a second
 * ADD COLUMN migration breaks the numbered sequence with duplicate columns
 * (SQLite has no ADD COLUMN IF NOT EXISTS).
 * F-3: an admin-created ad must be able to complete the intended workflow
 * draft → pending_review → active through the review endpoint (no dead-end),
 * still gated by admin authorization.
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'ads-9a-remediation',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

/** Wrap a node:sqlite DatabaseSync handle in the D1 call surface. */
function wrapRaw(raw: {
    prepare: (s: string) => {
        all: (...p: unknown[]) => unknown[];
        run: (...p: unknown[]) => { lastInsertRowid: unknown; changes: unknown };
    };
}): SqliteD1 {
    const probe = Object.create(SqliteD1.prototype) as SqliteD1;
    (probe as unknown as { __raw: unknown }).__raw = raw;
    (probe as unknown as { prepare: unknown }).prepare = (sqlText: string) => {
        const norm = sqlText.replace(/datetime\("now"\)/g, "datetime('now')");
        const safe = (params: unknown[]) => params.map((v) => (v === undefined ? null : v));
        return {
            bind: (...params: unknown[]) => {
                const p = safe(params);
                const oneShot = () => raw.prepare(norm);
                return {
                    all: async () => ({ results: oneShot().all(...p), success: true, meta: {} }),
                    first: async () => {
                        const rows = oneShot().all(...p) as unknown[];
                        return rows.length > 0 ? rows[0] : null;
                    },
                    run: async () => {
                        const out = oneShot().run(...p);
                        return {
                            success: true,
                            meta: {
                                last_row_id: out.lastInsertRowid == null ? null : Number(out.lastInsertRowid),
                                changes: Number(out.changes),
                            },
                        };
                    },
                };
            },
            run: async () => {
                const out = raw.prepare(norm).run();
                return {
                    success: true,
                    meta: {
                        last_row_id: out.lastInsertRowid == null ? null : Number(out.lastInsertRowid),
                        changes: Number(out.changes),
                    },
                };
            },
            all: async () => ({ results: raw.prepare(norm).all(), success: true, meta: {} }),
            first: async () => {
                const rows = raw.prepare(norm).all() as unknown[];
                return rows.length > 0 ? rows[0] : null;
            },
        };
    };
    return probe;
}
/** Apply ONLY migrations 0001..0024 (pre-9.A layout) to a fresh in-memory DB. */
function openPreLifecycleDb(): SqliteD1 {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const { readFileSync, readdirSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    const dir = join(process.cwd(), 'migrations');
    for (const file of readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort()) {
        // Keep the legacy ads columns (0003 ALTERs); skip the 9.A migration
        // (0025) for the pre-upgrade picture.
        if (file.localeCompare('0025_ads_campaign_lifecycle.sql') >= 0) continue;
        const sql: string = readFileSync(join(dir, file), 'utf8');
        // 0011_fix.sql is not idempotent against this stripped layout; it
        // targets competition_invitations and is irrelevant to the ads probe.
        if (file === '0011_fix.sql') continue;
        raw.exec(sql);
    }
    return wrapRaw(raw);
}

describe('9.A remediation — F-1 migration carry-over + F-3 admin workflow', () => {
    it('0025 preserves production-like data and relations without any DROP', async () => {
        const db = openPreLifecycleDb();

        // production-like rows on the legacy layout (0001 + 0003 columns)
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active) VALUES
             (1, 'adv@9a.local', 'adv9a', 'x', 'Advertiser', 0, 1),
             (9, 'viewer@9a.local', 'viewer9a', 'x', 'Viewer', 0, 1)`
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'general9a', 'عام', 'General')`
        ).run();
        await db.prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, status) VALUES
             (1, 'Legacy comp', 'rules', 1, 1, 'live')`
        ).run();
        await db.prepare(
            `INSERT INTO advertisements
              (id, title, image_url, link_url, is_active, views_count, clicks_count, revenue_per_view,
               created_by, created_at, advertiser_id, budget, budget_remaining, target_language, target_country, campaign_status)
             VALUES
              (1, 'Legacy active ad', NULL, NULL, 1, 50, 5, 0.01, 1, '2026-01-01 00:00:00', 1, 10.00, 7.50, NULL, NULL, 'active'),
              (2, 'Legacy depleted ad', NULL, NULL, 0, 300, 10, 0.01, 1, '2026-01-02 00:00:00', 1, 3.00, 0.00, NULL, NULL, 'depleted')`
        ).run();
        await db.prepare(
            `INSERT INTO ad_impressions (id, ad_id, competition_id, user_id, created_at) VALUES
             (1, 1, 1, 9, '2026-01-03 00:00:00'),
             (2, 1, 1, NULL, '2026-01-03 01:00:00'),
             (3, 2, 1, 9, '2026-01-04 00:00:00')`
        ).run();
        await db.prepare(
            `INSERT INTO ad_blocks (id, user_id, ad_id, created_at) VALUES
             (1, 9, 1, '2026-01-05 00:00:00')`
        ).run();
        await db.prepare(
            `INSERT INTO platform_financial_logs (entry_type, amount, competition_id, ad_id, public_description, period_date) VALUES
             ('ad_revenue', 0.03, 1, 1, 'legacy ad revenue', '2026-01-03')`
        ).run();

        const countOf = async (table: string): Promise<number> =>
            (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).bind().first<{ n: number }>())!.n;
        const before = {
            ads: await countOf('advertisements'),
            impressions: await countOf('ad_impressions'),
            blocks: await countOf('ad_blocks'),
            logs: await countOf('platform_financial_logs'),
        };
        expect(before).toEqual({ ads: 2, impressions: 3, blocks: 1, logs: 1 });

        // RED: prove the DROP pattern itself destroys the children — the very
        // thing the REMOTE review flagged in 0025. On an isolated SAVEPOINT,
        // DROP TABLE advertisements with FK ON cascades into the dependents.
        const rawProbe = (db as unknown as { __raw: {
            exec: (s: string) => void;
            prepare: (s: string) => { all: () => { n: number }[] };
        } }).__raw;
        rawProbe.exec('SAVEPOINT probe_sp; DROP TABLE advertisements;');
        const lost = rawProbe.prepare('SELECT COUNT(*) AS n FROM ad_impressions').all()[0].n;
        expect(lost).toBe(0);
        rawProbe.exec('ROLLBACK TO probe_sp; RELEASE probe_sp;');
        // rolled back — probe untouched
        expect(await countOf('ad_impressions')).toBe(3);

        // apply the FIXED migration script (additive only — no DROP anywhere)
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const fixed = readFileSync(join(process.cwd(), 'migrations/0025_ads_campaign_lifecycle.sql'), 'utf8');
        expect(fixed.toUpperCase()).not.toContain('DROP TABLE');
        (db as unknown as { __raw: { exec: (s: string) => void } }).__raw.exec(fixed);

        // data + relations preserved
        expect({
            ads: await countOf('advertisements'),
            impressions: await countOf('ad_impressions'),
            blocks: await countOf('ad_blocks'),
            logs: await countOf('platform_financial_logs'),
        }).toEqual(before);

        // cent backfill + status mapping
        const ad1 = (await db.prepare('SELECT budget_cents, cost_per_impression_cents, campaign_lifecycle_status, title, views_count FROM advertisements WHERE id = 1').bind().first<{
            budget_cents: number; cost_per_impression_cents: number; campaign_lifecycle_status: string; title: string; views_count: number;
        }>())!;
        expect(ad1.title).toBe('Legacy active ad');
        expect(ad1.views_count).toBe(50);
        expect(ad1.budget_cents).toBe(1000);
        expect(ad1.cost_per_impression_cents).toBe(1);
        expect(ad1.campaign_lifecycle_status).toBe('active');
        const ad2 = (await db.prepare('SELECT campaign_lifecycle_status FROM advertisements WHERE id = 2').bind().first<{ campaign_lifecycle_status: string }>())!;
        expect(ad2.campaign_lifecycle_status).toBe('ended');

        // relations still resolve (impression → ad, block → ad, log → ad)
        const joinRow = (await db.prepare(
            `SELECT i.id AS imp, a.title AS title, l.public_description AS descr
             FROM ad_impressions i
             JOIN advertisements a ON a.id = i.ad_id
             LEFT JOIN ad_blocks b ON b.ad_id = a.id
             LEFT JOIN platform_financial_logs l ON l.ad_id = a.id
             WHERE i.id = 1`
        ).bind().first<{ imp: number; title: string; descr: string }>())!;
        expect(joinRow.title).toBe('Legacy active ad');
        expect(joinRow.descr).toBe('legacy ad revenue');

        // no dangling references anywhere
        const dangling = (await db.prepare(
            `SELECT
               (SELECT COUNT(*) FROM ad_impressions WHERE ad_id NOT IN (SELECT id FROM advertisements)) AS imp,
               (SELECT COUNT(*) FROM ad_blocks WHERE ad_id NOT IN (SELECT id FROM advertisements)) AS blk,
               (SELECT COUNT(*) FROM platform_financial_logs WHERE ad_id IS NOT NULL AND ad_id NOT IN (SELECT id FROM advertisements)) AS log`
        ).bind().first<{ imp: number; blk: number; log: number }>())!;
        expect(dangling).toEqual({ imp: 0, blk: 0, log: 0 });

        // new schema works on carried rows: the 9.A serving selection refuses
        // legacy-active rows holding a zero ledger balance (safe default)
        const manager = new AdCampaignManager(db as unknown as D1Database);
        expect(await manager.getActiveAdsForCompetition(1)).toEqual([]);
    });

    it('F-3: admin-created ad completes draft → pending_review → active (no dead-end)', async () => {
        const db = new SqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active) VALUES
             (2, 'adv@9a.local', 'adv9a', 'x', 'Advertiser', 0, 1),
             (3, 'admin@9a.local', 'admin9a', 'x', 'Admin', 1, 1)`
        ).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at) VALUES
             ('sess-admin', 3, datetime('now', '+1 day')),
             ('sess-adv', 2, datetime('now', '+1 day'))`
        ).run();

        // admin creates the ad (F-3 dead-end entry point)
        let res = await app.request('/api/admin/ads?lang=en', {
            method: 'POST', headers: headers('sess-admin'),
            body: JSON.stringify({ title: 'Admin seeded ad', budget_cents: 500 }),
        }, env(db));
        expect(res.status).toBe(201);
        const created = (await res.json()) as { data: { ad: { id: number } } };
        const id = created.data.ad.id;

        // review gate is admin-only: advertiser token cannot approve
        res = await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`, {
            method: 'PUT', headers: headers('sess-adv'),
            body: JSON.stringify({ approve: true }),
        }, env(db));
        expect(res.status).toBe(403);

        // owner submits it, admin approves — workflow completes, no dead-end.
        // (9.D: the admin owns this row — registerExternalRow books
        // advertiser_id = admin — so the OWNER submits via its own session;
        // a foreign advertiser submitting it is 403, covered in 9.D tests.)
        res = await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`, {
            method: 'POST', headers: headers('sess-admin'),
        }, env(db));
        expect(res.status).toBe(200);
        res = await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`, {
            method: 'PUT', headers: headers('sess-admin'),
            body: JSON.stringify({ approve: true }),
        }, env(db));
        expect(res.status).toBe(200);
        const ok = (await res.json()) as { data: { ad: { campaign_status: string } } };
        expect(ok.data.ad.campaign_status).toBe('active');

        // F-4: the review is recorded in the EXISTING admin_audit_logs trail
        const audit = new AdminAuditLogModel(db as unknown as D1Database);
        const logs = (await audit.getLogs({ action_type: 'review_ad_campaign', limit: 10 })) as Array<{
            admin_id: number; action_type: string; target_entity: string; target_id: number; details: string; created_at: string;
        }>;
        expect(logs.length).toBeGreaterThanOrEqual(1);
        const entry = logs[0];
        expect(entry.admin_id).toBe(3);
        expect(entry.action_type).toBe('review_ad_campaign');
        expect(entry.target_entity).toBe('advertisement');
        expect(entry.target_id).toBe(id);
        expect(typeof entry.created_at).toBe('string');
    });

    it('F-2: advertiser portal renders the integer-cents contract (budget_cents form fields)', async () => {
        const db = new SqliteD1();
        const res = await app.request('/advertiser?lang=en', {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();

        // integer-cents contract: cents form fields + labels; the legacy REAL
        // budget / revenue_per_view ($) inputs are gone
        expect(html).toContain('id="campaignBudget"');
        expect(html).toContain('budget_cents: parseInt(');
        expect(html).toContain('cost_per_impression_cents: parseInt(');
        expect(html).toContain('Budget (cents)');
        expect(html).toContain('Cost per impression (cents)');
        expect(html).not.toContain(' ($)');
        expect(html).not.toContain('budget: parseFloat(');

        // lifecycle actions are wired in the portal: draft submit + end for
        // active/paused (previously dead-end: submitCampaign/endCampaign had
        // no buttons, so a portal-created campaign could never be submitted
        // or ended from the UI)
        expect(html).toContain('data-csp-fn="submitCampaign"');
        expect(html).toContain('data-csp-fn="endCampaign"');
    });
});