/**
 * UNIT32.2 / R4-ACCOUNT-COMP-LIFECYCLE-1 — creator competition delete guard
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import { CompetitionInvitationModel } from '../../src/models/CompetitionInvitationModel';

const CREATOR = 32201;
const OTHER = 32202;
const INVITEE = 32203;
const CREATOR_SESSION = 'u322-sess-creator';
const OTHER_SESSION = 'u322-sess-other';
const INVITEE_SESSION = 'u322-sess-invitee';

const env = (database: SqliteD1) => ({ DB: database as unknown as D1Database } as never);

let db: SqliteD1;

function randomOctet(): number {
    return Math.floor(Math.random() * 250) + 1;
}

async function call(
    method: string,
    path: string,
    session?: string,
    body?: unknown
): Promise<Response> {
    const separator = path.includes('?') ? '&' : '?';
    return app.request(
        `${path}${separator}lang=en`,
        {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(session ? { Authorization: `Bearer ${session}` } : {}),
                'X-CSRF-Token': 'test',
                'X-Forwarded-For': `10.${randomOctet()}.${randomOctet()}.${randomOctet()}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        },
        env(db)
    );
}

function seedBase(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${CREATOR}, 'u322-c@test.local', 'u322_creator', 'x', 'Creator', 1, 1),
               (${OTHER}, 'u322-o@test.local', 'u322_other', 'x', 'Other', 1, 1),
               (${INVITEE}, 'u322-i@test.local', 'u322_invitee', 'x', 'Invitee', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (32200, 'u322-cat', 'U322', 'U322 Cat');
        INSERT INTO sessions (id, user_id, expires_at) VALUES
            ('${CREATOR_SESSION}', ${CREATOR}, datetime('now', '+1 day')),
            ('${OTHER_SESSION}', ${OTHER}, datetime('now', '+1 day')),
            ('${INVITEE_SESSION}', ${INVITEE}, datetime('now', '+1 day'));
    `);
}

function insertCompetition(id: number, options: { opponentId?: number | null; status?: string; startedAt?: string | null } = {}): void {
    const opponent = options.opponentId === undefined ? 'NULL' : String(options.opponentId);
    const status = options.status ?? 'pending';
    const started = options.startedAt ? `'${options.startedAt}'` : 'NULL';
    db.exec(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, started_at, competition_type)
        VALUES (${id}, 'U322 comp ${id}', 'rules', 32200, ${CREATOR}, ${opponent}, '${status}', ${started}, 'instant');
    `);
}

async function scalar(sql: string): Promise<number> {
    const row = (await db.prepare(sql).first()) as Record<string, number> | null;
    return Number(Object.values(row || { n: 0 })[0]);
}

beforeEach(() => {
    db = createSqliteD1();
    seedBase();
});

describe('UNIT32.2 — DELETE /api/competitions/:id (creator lifecycle)', () => {
    it('eligible pending competition deletes dependents and keeps notification history', async () => {
        insertCompetition(32210);
        await call('POST', '/api/competitions/32210/request', OTHER_SESSION, {});
        await call('POST', '/api/competitions/32210/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        db.exec(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, is_read)
            VALUES (${CREATOR}, 'system', 't', 'm', 'competition', 32210, 0);
        `);
        const notesBefore = await scalar('SELECT COUNT(*) FROM notifications WHERE reference_id = 32210');

        const del = await call('DELETE', '/api/competitions/32210', CREATOR_SESSION);
        expect(del.status).toBe(200);

        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 32210')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 32210')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 32210')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM notifications WHERE reference_id = 32210')).toBe(notesBefore);
    });

    it('non-owner 403, anon 401, missing 404', async () => {
        insertCompetition(32211);
        expect((await call('DELETE', '/api/competitions/32211', OTHER_SESSION)).status).toBe(403);
        expect((await call('DELETE', '/api/competitions/32211')).status).toBe(401);
        expect((await call('DELETE', '/api/competitions/99999', CREATOR_SESSION)).status).toBe(404);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 32211')).toBe(1);
    });

    it('with opponent, non-pending, or started → 409 and no dependent deletes', async () => {
        insertCompetition(32212, { opponentId: INVITEE });
        db.exec(`INSERT INTO competition_requests (competition_id, requester_id, status) VALUES (32212, ${OTHER}, 'pending');`);
        expect((await call('DELETE', '/api/competitions/32212', CREATOR_SESSION)).status).toBe(409);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 32212')).toBe(1);
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 32212')).toBe(1);

        insertCompetition(32213, { status: 'accepted' });
        expect((await call('DELETE', '/api/competitions/32213', CREATOR_SESSION)).status).toBe(409);

        insertCompetition(32214);
        db.exec(`UPDATE competitions SET started_at = datetime('now') WHERE id = 32214`);
        expect((await call('DELETE', '/api/competitions/32214', CREATOR_SESSION)).status).toBe(409);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 32214')).toBe(1);
    });

    it('race: accept wins first → delete 409 and data intact', async () => {
        insertCompetition(32220);
        const invited = await call('POST', '/api/competitions/32220/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(invited.status).toBe(200);
        const invRow = await db.prepare(
            'SELECT id FROM competition_invitations WHERE competition_id = 32220 AND invitee_id = ?'
        ).bind(INVITEE).first<{ id: number }>();
        expect(invRow?.id).toBeTruthy();

        const model = new CompetitionInvitationModel(db as unknown as D1Database);
        await model.acceptInvitationAtomic(32220, invRow!.id, INVITEE);

        const del = await call('DELETE', '/api/competitions/32220', CREATOR_SESSION);
        expect(del.status).toBe(409);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 32220')).toBe(1);
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 32220')).toBe(INVITEE);
    });

    it('race: eligible delete wins first → later accept fails safely', async () => {
        insertCompetition(32221);
        const invited = await call('POST', '/api/competitions/32221/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(invited.status).toBe(200);
        const invRow = await db.prepare(
            'SELECT id FROM competition_invitations WHERE competition_id = 32221'
        ).first<{ id: number }>();

        const del = await call('DELETE', '/api/competitions/32221', CREATOR_SESSION);
        expect(del.status).toBe(200);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 32221')).toBe(0);

        const accept = await call('POST', '/api/competitions/32221/accept-invite', INVITEE_SESSION);
        expect(accept.status).toBeGreaterThanOrEqual(400);
    });

    it('duplicate DELETE after success is 404', async () => {
        insertCompetition(32222);
        expect((await call('DELETE', '/api/competitions/32222', CREATOR_SESSION)).status).toBe(200);
        expect((await call('DELETE', '/api/competitions/32222', CREATOR_SESSION)).status).toBe(404);
    });
});
