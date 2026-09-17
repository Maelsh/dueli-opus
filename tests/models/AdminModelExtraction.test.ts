import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AdminStatsModel } from '../../src/models/AdminStatsModel';
import { UserModel } from '../../src/models/UserModel';
import { CommentModel } from '../../src/models/CommentModel';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { ReportModel } from '../../src/models/ReportModel';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

/**
 * F-5D — SQL extraction from AdminController.
 * Proves (1) no direct SQL remains in the controller, and (2) the behaviour of
 * every extracted responsibility is preserved in the owning models.
 */
describe('F-5D AdminController SQL extraction', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'debate', 'مناظرة', 'Debate')`);
        db.exec(`INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active, country, created_at) VALUES
            (1, 'a@test.local', 'a', 'x', 'A', 0, 1, 'EG', '2026-01-01 00:00:01'),
            (2, 'b@test.local', 'b', 'x', 'B', 0, 1, 'SA', '2026-01-01 00:00:02'),
            (3, 'c@test.local', 'c', 'x', 'C', 1, 1, 'US', '2026-01-01 00:00:03')`);
        db.exec(`INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, total_views)
            VALUES (10, 'C1', 'r', 1, 1, 2, 'live', 500), (11, 'C2', 'r', 1, 2, NULL, 'completed', 900)`);
        db.exec(`INSERT INTO comments (id, competition_id, user_id, content) VALUES (100, 10, 2, 'hello')`);
        db.exec(`INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status) VALUES
            (200, 1, 'comment', 100, 'spam', 'pending'),
            (201, 2, 'user', 3, 'spam', 'pending')`);
        db.exec(`INSERT INTO advertisements (id, title, created_by) VALUES (300, 'ad', 1)`);
    });

    afterEach(() => { vi.restoreAllMocks(); db.close(); });

    it('AdminController no longer contains direct SQL', () => {
        const controller = readFileSync('src/controllers/AdminController.ts', 'utf8');
        expect(controller).not.toMatch(/\.prepare\(/);
        expect(controller).not.toMatch(/SELECT\s+\*?\s?[\w,.\s]*\s+FROM\s+/i);
        expect(controller).not.toMatch(/INSERT\s+INTO\s+/i);
        expect(controller).not.toMatch(/DELETE\s+FROM\s+/i);
        expect(controller).not.toMatch(/UPDATE\s+(users|competitions|reports|comments|ratings|chunk_keys|competition_suspensions)\s/i);
        // Responsibilities moved to dedicated models
        expect(controller).toContain("import { AdminStatsModel } from '../models/AdminStatsModel'");
        expect(controller).toContain("import { UserModel } from '../models/UserModel'");
    });

    // =====================================
    // 1+6. Dashboard & enhanced statistics → AdminStatsModel
    // =====================================
    it('AdminStatsModel preserves dashboard aggregates', async () => {
        const stats = new AdminStatsModel(db as unknown as D1Database);
        expect((await stats.countUsers())?.count).toBe(3);
        expect((await stats.countCompetitions())?.count).toBe(2);
        expect((await stats.countPendingReports())?.count).toBe(2);
        expect((await stats.countActiveAds())?.count).toBe(1);
        expect((await stats.competitionsByStatus()).results).toEqual([
            { status: 'completed', count: 1 },
            { status: 'live', count: 1 }
        ]);
    });

    it('AdminStatsModel preserves enhanced aggregates', async () => {
        const stats = new AdminStatsModel(db as unknown as D1Database);
        expect((await stats.countActiveUsers())?.count).toBe(3);
        expect((await stats.countArbitrationPending())?.count).toBe(2);
        expect((await stats.countCampaignActiveAds())?.count).toBe(1);
        const demo = (await stats.userCountryDemographics()).results || [];
        expect(demo.sort((a: any, b: any) => a.country.localeCompare(b.country)))
            .toEqual([
                { country: 'EG', count: 1 },
                { country: 'SA', count: 1 },
                { country: 'US', count: 1 }
            ]);
        const hot = (await stats.hottestCompetitions()).results || [];
        expect(hot.length).toBe(1);
        expect(hot[0]).toMatchObject({ id: 10, title: 'C1', status: 'live', creator_name: 'A', opponent_name: 'B' });
    });

    it('AdminStatsModel keeps the exact revenue SQL', async () => {
        const first = vi.fn().mockResolvedValue({ total: 5 });
        const prepare = vi.fn().mockReturnValue({ first });
        const stats = new AdminStatsModel({ prepare } as unknown as D1Database);
        expect(await stats.totalRevenue()).toEqual({ total: 5 });
        expect(prepare.mock.calls[0][0]).toBe('SELECT SUM(amount) as total FROM user_earnings');
    });

    // =====================================
    // 2+3. Users search / ban → UserModel
    // =====================================
    it('UserModel.searchForAdmin preserves search, sort and pagination', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const all = await users.searchForAdmin({ limit: 2, offset: 0 });
        expect(all.length).toBe(2);
        expect(all[0].id).toBe(3); // newest first (created_at DESC)
        const page2 = await users.searchForAdmin({ limit: 2, offset: 2 });
        expect(page2.length).toBe(1);
        const byEmail = await users.searchForAdmin({ search: 'b@' });
        expect(byEmail.map((u: any) => u.id)).toEqual([2]);
        const byDisplayName = await users.searchForAdmin({ search: 'B' });
        expect(byDisplayName.map((u: any) => u.id)).toEqual([2]);
    });

    it('UserModel preserves ban target resolution and active-flag update', async () => {
        const users = new UserModel(db as unknown as D1Database);
        expect(await users.getBanTarget(1)).toEqual({ id: 1, is_admin: 0 });
        expect((await users.getBanTarget(3))?.is_admin).toBe(1);
        expect(await users.getBanTarget(999)).toBeNull();
        await users.setActive(1, false);
        expect((await db.prepare('SELECT is_active FROM users WHERE id = 1').first() as any).is_active).toBe(0);
        await users.setActive(1, true);
        expect((await db.prepare('SELECT is_active FROM users WHERE id = 1').first() as any).is_active).toBe(1);
    });

    // =====================================
    // 4. Reports / audit target resolution → ReportModel
    // =====================================
    it('ReportModel.getTarget resolves moderation targets', async () => {
        const reports = new ReportModel(db as unknown as D1Database);
        expect(await reports.getTarget(200)).toEqual({ id: 200, target_type: 'comment', target_id: 100 });
        expect(await reports.getTarget(999)).toBeNull();
    });

    // =====================================
    // 5. Moderation cascade → UserModel/CommentModel/CompetitionModel
    // =====================================
    it('comment author resolution + deletion stays in CommentModel', async () => {
        const comments = new CommentModel(db as unknown as D1Database);
        expect(await comments.getAuthorId(100)).toBe(2);
        await comments.delete(100);
        expect(await comments.getAuthorId(100)).toBeNull();
    });

    it('CompetitionModel resolves the creator for ban cascades', async () => {
        expect(await new CompetitionModel(db as unknown as D1Database).getCreatorId(10)).toBe(1);
    });

    it('CompetitionModel.deleteCascade removes dependents then the competition', async () => {
        // Use competition 11 (no dependent comments) — FKs are enforced in D1.
        db.exec(`INSERT INTO competition_requests (competition_id, requester_id, status) VALUES (11, 1, 'pending')`);
        db.exec(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status) VALUES (11, 1, 2, 'pending')`);
        db.exec(`INSERT INTO ratings (competition_id, user_id, competitor_id, rating) VALUES (11, 2, 1, 5)`);
        db.exec(`INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key) VALUES (11, 0, 'k')`);
        const model = new CompetitionModel(db as unknown as D1Database);
        await model.deleteCascade(11);
        for (const table of ['competition_requests', 'competition_invitations', 'ratings', 'chunk_keys']) {
            const row = await db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE competition_id = 11`).first<any>();
            expect(row.c).toBe(0);
        }
        expect(await db.prepare('SELECT COUNT(*) as c FROM competitions WHERE id = 11').first<any>()).toEqual({ c: 0 });
    });

    // =====================================
    // 7. Suspend / restore → CompetitionModel
    // =====================================
    it('CompetitionModel preserves suspend/restore state machine', async () => {
        const model = new CompetitionModel(db as unknown as D1Database);
        expect(await model.getSuspendState(10)).toMatchObject({
            id: 10, title: 'C1', status: 'live', creator_id: 1, opponent_id: 2
        });
        expect(await model.getRestoreState(999)).toBeNull();

        await model.suspend(10, '[SUSPENDED by A (Admin)] reason');
        expect((await model.getRestoreState(10))?.status).toBe('suspended');
        expect((await db.prepare('SELECT auto_deleted_reason FROM competitions WHERE id = 10').first() as any).auto_deleted_reason)
            .toBe('[SUSPENDED by A (Admin)] reason');

        await model.recordSuspension(10, 3, 'reason');
        const open = await db.prepare('SELECT * FROM competition_suspensions WHERE competition_id = 10 AND restored_at IS NULL').first<any>();
        expect(open).toMatchObject({ admin_id: 3, reason: 'reason' });

        await model.markSuspensionRestored(10, 3);
        const restored = await db.prepare('SELECT * FROM competition_suspensions WHERE competition_id = 10').first<any>();
        expect(restored.restored_by).toBe(3);
        expect(restored.restored_at).toBeTruthy();

        await model.restore(10, '[RESTORED by A] reason');
        expect((await model.getRestoreState(10))?.status).toBe('archived');
    });
});
