/**
 * B7 pagination stability — RESOLVED by R3-D1 (h7-v1).
 *
 * History: the REMOTE review proved Explore's progressive loading used
 * `ORDER BY RANDOM()`, making `LIMIT/OFFSET` paging unstable (overlap /
 * skips). R3-D1 removes the last competition-discovery RANDOM():
 * ranked discovery now freezes the full H7-ordered id set once at T0 on
 * the shared session store (chunks + opaque cursor + skip-and-fill to
 * real exhaustion). The legacy `findByFilters` compat surface is
 * deterministic newest-first.
 *
 * This file now pins the FIXED contract:
 *  1. no `ORDER BY RANDOM()` remains in competition discovery SQL
 *     (ads keep their own single-row shuffle — out of D1 scope);
 *  2. consecutive legacy pages are stable (no overlap, no gaps);
 *  3. frozen H7 sessions traverse exactly-once to real exhaustion.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { UserModel } from '../../src/models/UserModel';
import { ExploreResultProvider, ExploreSessionService } from '../../src/lib/services/ExploreSessionService';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

const TOTAL = 40;
const PAGE = 10;

describe('B7 — Explore pagination ordering (R3-D1 fixed)', () => {
    let db: D1Database;
    let model: CompetitionModel;

    beforeAll(async () => {
        db = createSqliteD1() as unknown as D1Database;
        model = new CompetitionModel(db);
        // A real creator row is required by the competitions foreign key.
        await new UserModel(db).create({
            email: 'pager@example.com',
            username: 'pager',
            password_hash: 'x',
            display_name: 'Pager',
            country: 'SA',
            language: 'ar',
        } as never);
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
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

    it('no ORDER BY RANDOM() remains in competition discovery SQL', () => {
        const src = readFileSync(join(process.cwd(), 'src/models/CompetitionModel.ts'), 'utf-8');
        // Strip comments: historical notes may NAME the removed pattern;
        // only executable SQL counts.
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|\s)\/\/.*$/gm, '$1');
        expect(code).not.toMatch(/ORDER BY RANDOM\(\)/);
        expect(code).toMatch(/ORDER BY c\.created_at DESC, c\.id ASC LIMIT \? OFFSET \?/);
    });

    it('consecutive legacy pages are stable (no overlap, no gaps)', async () => {
        const seen = new Set<number>();
        for (let offset = 0; offset < TOTAL; offset += PAGE) {
            const page = await model.findByFilters({ limit: PAGE, offset } as never);
            expect(page).toHaveLength(PAGE);
            for (const row of page) {
                expect(seen.has(row.id), `duplicate ${row.id} across legacy pages`).toBe(false);
                seen.add(row.id);
            }
        }
        expect(seen.size).toBe(TOTAL);
    });

    it('frozen sessions traverse exactly-once to real exhaustion', async () => {
        const service = new ExploreSessionService(db);
        const identity = { kind: 'guest', key: 'guest:b7-fixed-probe' } as const;
        const { session } = await service.createSessionWithProvider(
            identity,
            new ExploreResultProvider({ status: '' }),
            'ar'
        );
        expect(session.total_count).toBe(TOTAL);
        const ids: number[] = [];
        let cursor: string | null | undefined;
        for (let pages = 0; ; pages += 1) {
            const outcome = await service.readPageWithProvider(
                identity,
                session.id,
                {
                    cursor: cursor ?? null,
                    limit: PAGE,
                    provider: new ExploreResultProvider({ status: '' }),
                    lang: 'ar',
                }
            );
            if ('failure' in outcome) throw new Error(`unexpected session failure: ${outcome.failure}`);
            ids.push(...outcome.page.items.map((c) => c.id));
            if (!outcome.page.hasMore) {
                expect(outcome.page.nextCursor).toBeNull();
                break;
            }
            cursor = outcome.page.nextCursor ?? undefined;
            if (pages > 20) throw new Error('session traversal did not terminate');
        }
        expect(ids).toHaveLength(TOTAL);
        expect(new Set(ids).size).toBe(TOTAL);
    });
});
