import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserModel } from '../../src/models/UserModel';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import { readFileSync } from 'node:fs';

describe('C7 synthetic-data safety: real creations are not fake', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = createSqliteD1();
    });
    afterEach(() => { db.close(); });

    it('UserModel.create marks the new user is_fake=0', async () => {
        const model = new UserModel(db as unknown as D1Database);
        const user = await model.create({
            email: 'real@dueli.local',
            username: 'realuser',
            display_name: 'Real User',
            password_hash: 'x',
        });
        expect(user.is_fake).toBe(0);
        const row = await db.prepare('SELECT is_fake FROM users WHERE id = ?').bind(user.id).first<{ is_fake: number }>();
        expect(row?.is_fake).toBe(0);
    });

    it('CompetitionModel.create marks the new competition is_fake=0', async () => {
        db.exec(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 't', 'T', 'T')`);
        const users = new UserModel(db as unknown as D1Database);
        const creator = await users.create({
            email: 'host@dueli.local',
            username: 'hostuser',
            display_name: 'Host',
            password_hash: 'x',
        });
        const comps = new CompetitionModel(db as unknown as D1Database);
        const comp = await comps.create({
            title: 'Real',
            rules: 'rules',
            category_id: 1,
            creator_id: creator.id,
            language: 'ar',
        } as never);
        expect((comp as { is_fake: number }).is_fake).toBe(0);
    });

    it('OAuth creation path pins is_fake=0 (static pin)', () => {
        const source = readFileSync('src/modules/api/auth/oauth-routes.ts', 'utf8');
        expect(source).toContain('is_fake, created_at');
        expect(source).toContain('?, 1, 1, 0, datetime(');
    });
});
