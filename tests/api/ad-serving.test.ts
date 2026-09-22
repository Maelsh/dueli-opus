import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { t } from '../../src/i18n';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'ads-9b-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

const ADV = 'sess-9b-adv';
const ADMIN = 'sess-9b-admin';
const VIEWER = 'sess-9b-viewer';

/** competition 100: ar / EG / category 10 — competition 101: en / US / category 11 */
async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active, language, country) VALUES
         (2, 'adv@9b.local', 'adv9b', 'x', 'Advertiser', 0, 1, 'ar', 'EG'),
         (3, 'admin@9b.local', 'admin9b', 'x', 'Admin', 1, 1, 'ar', 'EG'),
         (5, 'viewer@9b.local', 'viewer9b', 'x', 'Viewer', 0, 1, 'ar', 'EG')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${ADV}', 2, datetime('now', '+1 day')),
         ('${ADMIN}', 3, datetime('now', '+1 day')),
         ('${VIEWER}', 5, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES
         (10, 'debate9b', 'مناظرة', 'Debate'),
         (11, 'sports9b', 'رياضة', 'Sports')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, status, language, country) VALUES
         (100, 'Comp ar/EG/debate', 'rules', 10, 2, 'live', 'ar', 'EG'),
         (101, 'Comp en/US/sports', 'rules', 11, 2, 'live', 'en', 'US')`
    ).run();
}

async function createCampaign(
    db: SqliteD1,
    body: Record<string, unknown>
): Promise<number> {
    const res = await app.request('/api/advertiser/campaigns?lang=en', {
        method: 'POST',
        headers: headers(ADV),
        body: JSON.stringify({ title: 'Campaign 9.B', budget_cents: 100, cost_per_impression_cents: 1, ...body }),
    }, env(db));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { success: boolean; data: { ad: { id: number } } };
    const id = json.data.ad.id;
    expect(
        (await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`, {
            method: 'POST', headers: headers(ADV),
        }, env(db))).status
    ).toBe(200);
    expect(
        (await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`, {
            method: 'PUT', headers: headers(ADMIN),
            body: JSON.stringify({ approve: true }),
        }, env(db))).status
    ).toBe(200);
    return id;
}

/** Targeted serving — targeting is resolved server-side from the competition. */
async function serve(db: SqliteD1, competitionId: number, extra = '') {
    const res = await app.request(
        `/api/advertisements?competition_id=${competitionId}&limit=20&lang=en${extra}`,
        { headers: headers(VIEWER) },
        env(db)
    );
    expect(res.status).toBe(200);
    return (await res.json()) as { success: boolean; data: Array<{ id: number; sponsored_label?: string; why_this_ad?: string; hide_ad?: string }> };
}

const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id);

describe('9.B — ad serving and targeting', () => {
    let db: SqliteD1;
    let adLang: number;
    let adCountry: number;
    let adCategory: number;
    let adMismatch: number;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
        adLang = await createCampaign(db, { title: 'Lang ar', target_language: 'ar' });
        adCountry = await createCampaign(db, { title: 'Country EG', target_country: 'EG' });
        adCategory = await createCampaign(db, { title: 'Category debate', target_category_id: 10 });
        adMismatch = await createCampaign(db, {
            title: 'Mismatch en/US/sports',
            target_language: 'en',
            target_country: 'US',
            target_category_id: 11,
        });
    });

    it('1. ad matching the competition language is served', async () => {
        expect(ids((await serve(db, 100)).data)).toContain(adLang);
    });

    it('2. ad matching the competition country is served', async () => {
        expect(ids((await serve(db, 100)).data)).toContain(adCountry);
    });

    it('3. ad matching the competition category is served', async () => {
        expect(ids((await serve(db, 100)).data)).toContain(adCategory);
    });

    it('4. ad matching none of the targeting criteria is not served', async () => {
        expect(ids((await serve(db, 100)).data)).not.toContain(adMismatch);
        // …while it IS served in its own matching context (proves targeting, not a dead ad).
        expect(ids((await serve(db, 101)).data)).toContain(adMismatch);
    });

    it('5. ad blocked by the viewer (AdBlockModel) is not served — server-side', async () => {
        expect(ids((await serve(db, 100)).data)).toContain(adLang);
        const block = await app.request('/api/ad-blocks?lang=en', {
            method: 'POST', headers: headers(VIEWER),
            body: JSON.stringify({ ad_id: adLang }),
        }, env(db));
        expect(block.status).toBe(200);
        expect(ids((await serve(db, 100)).data)).not.toContain(adLang);
        // Other matching ads are unaffected.
        expect(ids((await serve(db, 100)).data)).toContain(adCountry);
    });

    it('6. frequency cap: serving excludes the ad and a further impression is rejected server-side', async () => {
        const adCap = await createCampaign(db, { title: 'Cap probe' });
        expect(ids((await serve(db, 100)).data)).toContain(adCap);
        for (let i = 0; i < 5; i++) {
            const res = await app.request(`/api/advertisements/${adCap}/impression?lang=en`, {
                method: 'POST', headers: headers(VIEWER),
                body: JSON.stringify({ competition_id: 100, user_id: 5 }),
            }, env(db));
            expect(res.status).toBe(200);
        }
        // Client state cannot bypass the cap: the 6th impression is rejected by the server.
        const over = await app.request(`/api/advertisements/${adCap}/impression?lang=en`, {
            method: 'POST', headers: headers(VIEWER),
            body: JSON.stringify({ competition_id: 100, user_id: 5 }),
        }, env(db));
        expect(over.status).toBe(429);
        // …and serving no longer offers the capped ad to this viewer.
        expect(ids((await serve(db, 100)).data)).not.toContain(adCap);
    });

    it('7. every served ad carries the sponsored label (i18n, no hard-coded text)', async () => {
        const { data } = await serve(db, 100);
        expect(data.length).toBeGreaterThan(0);
        for (const ad of data) {
            expect(ad.sponsored_label).toBe(t('ads.sponsored_label', 'en'));
            expect(ad.why_this_ad).toBe(t('ads.why_this_ad', 'en'));
            expect(ad.hide_ad).toBe(t('ads.hide_ad', 'en'));
        }
    });

    it('8. no ad is served in the private-messages context — server-side', async () => {
        // Sanity: the ad IS servable in a normal context…
        expect(ids((await serve(db, 100)).data)).toContain(adLang);
        // …but the sensitive context yields nothing from the server (not a frontend hide).
        const res = await app.request(
            '/api/advertisements?competition_id=100&limit=20&lang=en&context=private_messages',
            { headers: headers(VIEWER) },
            env(db)
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: unknown[] }).data).toEqual([]);
    });
});
