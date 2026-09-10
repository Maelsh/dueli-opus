import { describe, it, expect, beforeEach } from 'vitest';
import { RatingModel } from '../../src/models/RatingModel';
import { FakeD1 } from '../helpers/fake-d1';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * B5-3 — RatingModel extracted into models layer.
 *
 * Verifies:
 * 1. create() inserts a row and returns id.
 * 2. hasRated() = false before, true after.
 * 3. findByCompetition() returns rows with user data.
 * 4. Architectural guard: no `class RatingModel` or `INSERT INTO ratings`
 *    remains in CompetitionController.ts.
 */
describe('RatingModel', () => {
    let db: FakeD1;
    let model: RatingModel;

    beforeEach(() => {
        db = new FakeD1();
        model = new RatingModel(db as unknown as D1Database);

        // Seed two users for rating scenarios
        db.users.push(
            { id: 100, email: 'rater@test.local', username: 'rater', display_name: 'Rater', avatar_url: 'r.png' },
            { id: 200, email: 'competitor@test.local', username: 'competitor', display_name: 'Competitor', avatar_url: 'c.png' }
        );
    });

    it('1. create() inserts a row and returns id', async () => {
        const result = await model.create(1, 100, 200, 5);
        expect(result.id).toBeGreaterThan(0);
        expect(db.ratings.length).toBe(1);
        expect(db.ratings[0]).toMatchObject({
            competition_id: 1,
            user_id: 100,
            competitor_id: 200,
            rating: 5,
        });
    });

    it('2. hasRated() returns false before rating and true after', async () => {
        expect(await model.hasRated(1, 100, 200)).toBe(false);
        await model.create(1, 100, 200, 4);
        expect(await model.hasRated(1, 100, 200)).toBe(true);
    });

    it('3. findByCompetition() returns rows with user display_name and avatar_url', async () => {
        await model.create(1, 100, 200, 5);
        await model.create(1, 200, 100, 3);
        const rows = await model.findByCompetition(1);
        expect(rows.length).toBe(2);
        // Each row must carry user details from JOIN
        for (const row of rows) {
            expect(row.display_name).toBeDefined();
            expect(row.avatar_url).toBeDefined();
        }
    });

    it('4a. architectural guard: CompetitionController has no inline RatingModel class', () => {
        const ctrlPath = path.join(process.cwd(), 'src', 'controllers', 'CompetitionController.ts');
        const src = fs.readFileSync(ctrlPath, 'utf-8');
        expect(src).not.toMatch(/class RatingModel\s*\{/);
    });

    it('4b. architectural guard: CompetitionController has no INSERT INTO ratings', () => {
        const ctrlPath = path.join(process.cwd(), 'src', 'controllers', 'CompetitionController.ts');
        const src = fs.readFileSync(ctrlPath, 'utf-8');
        expect(src).not.toMatch(/INSERT INTO ratings/i);
    });
});