/**
 * B7 pagination stability — EVIDENCE, not a fix.
 *
 * The REMOTE review reported that the data source behind Explore's progressive
 * loading uses `ORDER BY RANDOM()`, which makes `LIMIT/OFFSET` paging
 * unstable (pages overlap / records get skipped). This test PROVES the finding
 * against the real SQL (real migrations via the node:sqlite D1 shim).
 *
 * It is deliberately a characterisation test, not a fix: changing the browse
 * ordering is a product/ranking decision and is out of scope for this batch.
 * It exists so the Lead has hard evidence for that decision.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { UserModel } from '../../src/models/UserModel';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

const TOTAL = 40;
const PAGE = 10;

describe('B7 — Explore pagination ordering (evidence)', () => {
    let db: D1Database;
    let model: CompetitionModel;

    beforeAll(async () => {
        db = createSqliteD1() as unknown as D1Database;
        model = new CompetitionModel(db);
        // A real creator row is required by the competitions foreign key.
        const creator = await new UserModel(db).create({
            email: 'pager@example.com',
            username: 'pager',
            password_hash: 'x',
            display_name: 'Pager',
            country: 'SA',
            language: 'ar',
        } as never);
        // Rows are inserted directly: the point under test is findByFilters'
        // ORDER BY, not the insert path (and the real FK graph wants a country).
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        // Migrations define the schema but do not seed reference data, so the
        // category join needs one row.
        await db.prepare(
            `INSERT INTO categories (slug, name_ar, name_en) VALUES ('probe', 'probe', 'probe')`
        ).run();
        const category = await db.prepare('SELECT id FROM categories ORDER BY id LIMIT 1').first<{ id: number }>();
        const categoryId = (category as { id: number } | null)?.id;
        expect(categoryId, 'migrations must seed at least one category').toBeTruthy();
        const insert = db.prepare(
            `INSERT INTO competitions
                (title, description, rules, category_id, creator_id, language, status, created_at)
             VALUES (?, 'd', 'r', ?, (SELECT id FROM users WHERE username = 'pager'), 'ar', 'pending', ?)`
        );
        for (let i = 1; i <= TOTAL; i++) {
            await insert.bind(`Paging probe ${i}`, categoryId, now).run();
        }
    });

    it('the Explore data source really does order randomly', () => {
        const src = readFileSync(join(process.cwd(), 'src/models/CompetitionModel.ts'), 'utf-8');
        expect(src).toMatch(/ORDER BY RANDOM\(\) LIMIT \? OFFSET \?/);
    });

    it('consecutive limit/offset pages can overlap (unstable pagination)', async () => {
        // Sample several page pairs: with a random order the same competition
        // can legitimately appear on two different pages.
        let overlaps = 0;
        for (let attempt = 0; attempt < 5; attempt++) {
            const page1 = await model.findByFilters({ limit: PAGE, offset: 0 } as never);
            const page2 = await model.findByFilters({ limit: PAGE, offset: PAGE } as never);
            const ids1 = new Set(page1.map((c) => c.id));
            const overlap = page2.filter((c) => ids1.has(c.id));
            if (overlap.length > 0) overlaps++;
            expect(page1).toHaveLength(PAGE);
            expect(page2).toHaveLength(PAGE);
        }
        // Proof for the Lead: pagination is NOT stable today.
        expect(overlaps, 'expected random ordering to produce overlapping pages').toBeGreaterThan(0);
    });
});
