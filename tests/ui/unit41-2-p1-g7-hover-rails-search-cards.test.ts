/**
 * UNIT41.2-P1 (G7) — horizontal rail hover interaction + hydrated search cards.
 *
 * Contract under test:
 * - Edge-hover auto-scroll is ONE shared helper (src/client/ui/
 *   edge-hover-scroll.ts): pure direction math (RTL/LTR-aware), bindings
 *   marked once per wrapper so re-renders never stack intervals, snap class
 *   toggled during the scroll.
 * - Home re-invokes its delegating setupAllHoverScroll (which calls the
 *   shared helper) after every render/append surface.
 * - Search result cards render the Dueli logo + category color/icon/name
 *   + BOTH competitors (creator vs opponent) instead of the trophy box and
 *   the host alone; colors ride data-csp-style (zero inline `style="`).
 * - SearchModel hydrates the card contract from the DB: opponent + category
 *   color/icon/name join (lang-aware).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { edgeScrollDirection } from '../../src/client/ui/edge-hover-scroll';

const env = (db: SqliteD1) => ({ DB: db }) as unknown as Parameters<typeof app.request>[2];
const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf-8');

describe('UNIT41.2-P1 G7 — edge-hover auto-scroll helper', () => {
    it('1. direction math: LTR forward is the right edge, RTL forward the left', () => {
        const w = 1000;
        // LTR: the overflow end is on the right → hovering the right edge
        // reveals more (forward +1); the left edge goes back (-1).
        expect(edgeScrollDirection(950, w, 0.1, false)).toBe(1);
        expect(edgeScrollDirection(50, w, 0.1, false)).toBe(-1);
        expect(edgeScrollDirection(900, w, 0.1, false)).toBe(0);
        expect(edgeScrollDirection(500, w, 0.1, false)).toBe(0);
        // RTL mirrors: forward (+1) is the LEFT edge, the right edge goes back.
        expect(edgeScrollDirection(50, w, 0.1, true)).toBe(1);
        expect(edgeScrollDirection(950, w, 0.1, true)).toBe(-1);
        expect(edgeScrollDirection(500, w, 0.1, true)).toBe(0);
    });

    it('2. degenerate inputs are safe (no NaN directions)', () => {
        expect(edgeScrollDirection(50, 0, 0.1, false)).toBe(0);
        expect(edgeScrollDirection(50, 1000, 0, false)).toBe(0);
    });

    it('3. the helper never double-binds a wrapped scroller', () => {
        const helper = read('src/client/ui/edge-hover-scroll.ts');
        expect(helper).toMatch(/data-dueli-edge-scroll/);
        expect(helper).toMatch(/scroller\.parentElement/);
        expect(helper).toMatch(/classList\.add\('dueli-auto-scrolling'\)/);
    });

    it('4. Home re-binds after renders/appends via the delegating setup', () => {
        const home = read('src/client/pages/HomePage.ts');
        expect(home).toMatch(/import \{ attachEdgeHoverScroll \}/);
        // The render/append paths re-invoke the delegating setup.
        const rebinds = (home.match(/this\.setupAllHoverScroll\(\)/g) ?? []).length;
        expect(rebinds).toBeGreaterThanOrEqual(5);
        expect(home).toMatch(/static setupAllHoverScroll/);
        // The carousel scroll() is direction-aware (RTL walks left).
        expect(home).toMatch(/isRTL|dir === 'rtl'|rtl/);
    });
});

describe('UNIT41.2-P1 G7 — search result cards carry the duel identity', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
             (2, 'a@g7.local', 'g7a', 'x', 'First Duelist', 1, 'ar', 'SA'),
             (3, 'b@g7.local', 'g7b', 'x', 'Second Duelist', 1, 'ar', 'EG')`,
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en, color, icon) VALUES
             (10, 'dialogue', 'حوار', 'Dialogue', '#8b5cf6', 'fa-comments')`,
        ).run();
        await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, opponent_id, language, status, created_at, vod_url, is_fake)
             VALUES ('G7 cup probe', 'd', 'r', 10, 2, 3, 'ar', 'pending', ?, NULL, 0)`,
        ).bind(new Date(Date.now() - 15 * 60_000).toISOString().slice(0, 19).replace('T', ' ')).run();
    });

    it('5. search hydration returns BOTH competitors + category color/icon/name', async () => {
        const res = await app.request('/api/search/competitions?q=' + encodeURIComponent('G7 cup probe') + '&lang=ar', {
            headers: { 'CF-Connecting-IP': '10.9.8.1' },
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            success: boolean;
            data: {
                items?: Array<{
                    id: number; creator_name?: string; opponent_name?: string;
                    category_color?: string | null; category_icon?: string | null; category_name?: string;
                }>;
            };
        };
        expect(json.success).toBe(true);
        const card = json.data.items?.[0];
        expect(card).toBeTruthy();
        expect(card?.creator_name).toBe('First Duelist');
        expect(card?.opponent_name).toBe('Second Duelist');
        expect(card?.category_color).toBe('#8b5cf6');
        expect(card?.category_icon).toBe('fa-comments');
        expect(String(card?.category_name)).toBe('حوار');
    });

    it('6. the card template shows the logo, the category identity and both names', () => {
        const home = read('src/client/pages/HomePage.ts');
        // Scope to the redesigned search-card region (the CSP ban on inline
        // styles applies to card markup; the banner/page may differ).
        const start = home.indexOf('const creatorLabel = HomePage.esc');
        expect(start).toBeGreaterThan(-1);
        const cardScope = home.slice(start, home.indexOf('renderEmptyState', start));
        // Dueli logo replaces the trophy-only box.
        expect(cardScope).toMatch(/\/static\/dueli-icon\.png/);
        // Category color/name/icon ride data-csp-style (CSP-safe).
        expect(cardScope).toMatch(/data-csp-style="color: \$\{categoryColor\}/);
        // No BARE inline style attribute (data-csp-style must not trip this).
        expect(cardScope).not.toMatch(/(?<![\w-])style="/);
        // Both sides render: creator vs opponent.
        expect(cardScope).toMatch(/creatorLabel/);
        expect(cardScope).toMatch(/opponentLabel/);
        expect(cardScope).toMatch(/>vs</);
        expect(cardScope).toMatch(/category_name \|\| ''/);
    });

    it('7. SearchModel hydrates the card in the search path (lang-aware names)', () => {
        const model = read('src/models/SearchModel.ts');
        expect(model).toMatch(/u2\.display_name as opponent_name/);
        expect(model).toMatch(/LEFT JOIN users u2 ON c\.opponent_id = u2\.id/);
        expect(model).toMatch(/category_color/);
        expect(model).toMatch(/category_icon/);
        expect(model).toMatch(/as category_name/);
        // The hydrated card honors the caller language (?lang), localized.
        expect(model).toMatch(/filters\.lang \?\? 'en'/);
    });
});
