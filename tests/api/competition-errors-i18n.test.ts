/**
 * B5-2 — remaining competition error messages go through i18n (ar + en).
 *
 * No state transitions here: the accepted-without-opponent fixture is
 * rejected by the controller BEFORE any write, and the i18n assertions
 * only check the translated error body (same status/shape as before).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

function env(db: FakeD1) {
    return { DB: db } as any;
}

describe('B5-2 competition error messages are localized', () => {
    let db: FakeD1;
    let sessionId: string;
    let meId: number;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        const me = await users.create({
            email: 'b52@test.local',
            username: 'b52user',
            display_name: 'B52',
        });
        meId = me.id;
        const sessions = new SessionModel(db as unknown as D1Database);
        sessionId = (await sessions.create({ user_id: me.id })).id;
        // Accepted competition WITHOUT opponent: start() hits the
        // no_opponent guard after ownership passes (creator == caller).
        db.competitions.push({
            id: 5201,
            title: 'B52 no-opponent',
            creator_id: me.id,
            opponent_id: null,
            status: 'accepted',
        });
        // Live competition: updateVod() without vod_url hits vod_url_required.
        db.competitions.push({
            id: 5202,
            title: 'B52 live',
            creator_id: me.id,
            opponent_id: me.id,
            status: 'live',
        });
    });

    async function post(path: string, lang: string, body?: unknown) {
        // The app's language middleware (main.ts) resolves lang from ?lang=
        // query param or Cookie — not Accept-Language. Pass it as ?lang=.
        const sep = path.includes('?') ? '&' : '?';
        return app.request(
            `${path}${sep}lang=${lang}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionId}`,
                    // CSRF: test token accepted by csrfProtection() middleware
                    'X-CSRF-Token': 'test',
                    // Rate-limit: isolate this suite's bucket per test run
                    'X-Forwarded-For': `10.52.0.${(Math.floor(Math.random() * 200) + 10)}`,
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            },
            env(db),
        );
    }

    async function authed(path: string, lang: string, body?: unknown) {
        // Sanity: auth + CSRF must pass here; i.e. a missing competition is
        // 404 (not 401/403), proving the request reached the controller.
        const probe = await post('/api/competitions/999999/start', lang, body);
        expect(probe.status).toBe(404);
        return post(path, lang, body);
    }

    it('POST /start without opponent (ar) returns the Arabic message', async () => {
        const res = await authed('/api/competitions/5201/start', 'ar');
        expect(res.status).toBe(409);
        const json = (await res.json()) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error).toBe('لا يمكن البدء بدون خصم');
    });

    it('POST /start without opponent (en) returns the English message', async () => {
        const res = await authed('/api/competitions/5201/start', 'en');
        expect(res.status).toBe(409);
        const json = (await res.json()) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error).toBe('Cannot start without an opponent');
    });

    it('POST /update-vod without vod_url (ar) returns the Arabic message', async () => {
        const res = await authed('/api/competitions/5202/update-vod', 'ar', {});
        expect(res.status).toBe(422);
        const json = (await res.json()) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error).toBe('رابط التسجيل مطلوب');
    });

    it('POST /update-vod without vod_url (en) returns the English message', async () => {
        const res = await authed('/api/competitions/5202/update-vod', 'en', {});
        expect(res.status).toBe(422);
        const json = (await res.json()) as { success: boolean; error: string };
        expect(json.success).toBe(false);
        expect(json.error).toBe('Recording URL (vod_url) is required');
    });

    it('regression guard: no raw English literals remain in CompetitionController', () => {
        const src = readFileSync(join(process.cwd(), 'src', 'controllers', 'CompetitionController.ts'), 'utf-8');
        for (const literal of [
            'Cannot start without opponent',
            'vod_url is required',
            'Competition already has opponent',
            'invitee_id required',
            'Cannot invite yourself',
            'User already invited',
            'No pending invitation found',
            'Competition not found or not owned by user',
            'No pending request found',
            'Request already processed',
            'User is already a competitor',
            'Competition is full',
        ]) {
            expect(src, `raw literal must be gone: ${literal}`).not.toContain(`'${literal}'`);
        }
    });
});
