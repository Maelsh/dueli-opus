/**
 * UNIT41.1 / R4-UI-UX-BROWSER-POLISH-1 — synthetic (is_fake = 1) isolation.
 *
 *   - synthetic accounts never appear in the opponent-invite panel
 *     (GET /api/matchmaking/online-users),
 *   - a crafted direct POST /api/competitions/:id/invite to a synthetic
 *     account is refused server-side (409),
 *   - CompetitionInvitationModel.createInvitation / insertPendingInvitation
 *     refuse synthetic invitees at the model layer too (defense in depth).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1, createSqliteD1 } from '../helpers/sqlite-d1';
import { CompetitionInvitationModel } from '../../src/models/CompetitionInvitationModel';
import { ConflictError } from '../../src/lib/errors/AppError';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 7000;
const headers = (extra?: Record<string, string>) => {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'synthetic-isolation',
        'CF-Connecting-IP': `10.8.${(ipSeq % 250) + 1}.${(ipSeq % 200) + 1}`,
        ...(extra ?? {}),
    };
};
const authed = (sessionId: string) => headers({ Authorization: `Bearer ${sessionId}` });

let db: SqliteD1;
let COMP_ID = 0;

beforeEach(async () => {
    db = createSqliteD1();
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`).run();
    // 700 = real creator, 701 = real candidate, 702 = synthetic candidate.
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_online, last_seen_at, is_busy, is_fake, language, country, created_at)
         VALUES
         (700, 'host@local', 'host', 'x', 'Host', 1, 1, datetime('now'), 0, 0, 'ar', 'SA', datetime('now')),
         (701, 'real@local', 'real1', 'x', 'Real One', 1, 1, datetime('now'), 0, 0, 'ar', 'SA', datetime('now')),
         (702, 'fake@local', 'fake1', 'x', 'Fake One', 1, 1, datetime('now'), 0, 1, 'ar', 'SA', datetime('now'))`
    ).run();
    const comp = await db.prepare(
        `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, country, status, is_fake, created_at)
         VALUES ('Isolation Test', 'd', 'r', 10, 700, 'ar', 'SA', 'pending', 0, datetime('now'))`
    ).run();
    COMP_ID = Number(comp.meta.last_row_id);
    await db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-host', 700, datetime('now', '+1 day'))`).run();
});

afterEach(() => {
    db.close();
});

describe('UNIT41.1 — synthetic accounts never appear as invite candidates', () => {
    it('GET /api/matchmaking/online-users excludes is_fake=1 users', async () => {
        const res = await app.request(`/api/matchmaking/online-users?competition_id=${COMP_ID}&lang=en`, {
            headers: authed('sess-host'),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { users: Array<{ id: number }>; total: number } };
        expect(json.success).toBe(true);
        const ids = json.data.users.map((u) => u.id);
        expect(ids).toContain(701);
        expect(ids).not.toContain(702);
        expect(json.data.total).toBe(ids.length);
    });

    it('search text also cannot surface a synthetic account', async () => {
        const res = await app.request(`/api/matchmaking/online-users?competition_id=${COMP_ID}&search=fake&lang=en`, {
            headers: authed('sess-host'),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { users: Array<{ id: number }>; total: number } };
        expect(json.data.users).toEqual([]);
        expect(json.data.total).toBe(0);
    });
});

describe('UNIT41.1 — a crafted direct invite to a synthetic account is refused server-side', () => {
    it('POST /api/competitions/:id/invite with a synthetic invitee returns 409', async () => {
        const res = await app.request(`/api/competitions/${COMP_ID}/invite`, {
            method: 'POST',
            headers: authed('sess-host'),
            body: JSON.stringify({ invitee_id: 702 }),
        }, env(db));
        expect(res.status).toBe(409);
        const json = (await res.json()) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error).toBe('This user cannot be invited');
        const rows = await db.prepare('SELECT COUNT(*) c FROM competition_invitations WHERE invitee_id = 702').first<{ c: number }>();
        expect(Number(rows?.c ?? 0)).toBe(0);
    });

    it('the same endpoint still invites a real user', async () => {
        const res = await app.request(`/api/competitions/${COMP_ID}/invite`, {
            method: 'POST',
            headers: authed('sess-host'),
            body: JSON.stringify({ invitee_id: 701 }),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { invited: boolean } };
        expect(json.data.invited).toBe(true);
    });

    it('the Arabic refusal message is used for lang=ar', async () => {
        const res = await app.request(`/api/competitions/${COMP_ID}/invite?lang=ar`, {
            method: 'POST',
            headers: authed('sess-host'),
            body: JSON.stringify({ invitee_id: 702 }),
        }, env(db));
        expect(res.status).toBe(409);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('لا يمكن دعوة هذا المستخدم');
    });
});

describe('UNIT41.1 — defense in depth at the model layer', () => {
    it('createInvitation refuses a synthetic invitee even on a direct model call', async () => {
        const model = new CompetitionInvitationModel(db as unknown as D1Database);
        await expect(
            model.createInvitation({ competition_id: COMP_ID, inviter_id: 700, invitee_id: 702 })
        ).rejects.toBeInstanceOf(ConflictError);
    });

    it('insertPendingInvitation refuses a synthetic invitee even on a direct model call', async () => {
        const model = new CompetitionInvitationModel(db as unknown as D1Database);
        await expect(
            model.insertPendingInvitation(COMP_ID, 700, 702, 'hello')
        ).rejects.toBeInstanceOf(ConflictError);
        const rows = await db.prepare('SELECT COUNT(*) c FROM competition_invitations WHERE invitee_id = 702').first<{ c: number }>();
        expect(Number(rows?.c ?? 0)).toBe(0);
    });
});
