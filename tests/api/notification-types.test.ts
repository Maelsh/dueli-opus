/**
 * @file tests/api/notification-types.test.ts
 * @description B9 — notification types are truthful and localized at render time.
 *
 * RED-FIRST — on the baseline commit these tests FAIL because:
 *   1. a message notification is persisted with `type = 'comment'` (copy/paste bug),
 *   2. the label is stored pre-translated in `notifications.title` at send time, so
 *      the recipient's request language can never change it,
 *   3. `GET /api/notifications` returns no deep link and no label fallback for
 *      legacy / unknown notification types,
 *   4. `notification.new_post_like`, `notification.new_post_comment` and the
 *      generic fallback key do not exist in ar/en.
 *
 * Contract asserted here (B9):
 *   stored : `type` + untranslated payload + reference_type/reference_id
 *            (never a translated sentence),
 *   served : `title`/`message` generated at render time in the REQUEST language
 *            (`?lang=`) plus a `link` deep link.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { NotificationModel } from '../../src/models/NotificationModel';
import { t } from '../../src/i18n';
import { FakeD1 } from '../helpers/fake-d1';
import type { Language, NotificationType } from '../../src/config/types';

const CONV_ID = 950001;
const COMP_ID = 960001;

/** Types B9 adds to NotificationType (src/config/types.ts). */
const B9_NEW_TYPES: NotificationType[] = ['message', 'post_like', 'post_comment'];
/** Types that already existed and must keep working unchanged. */
const B9_EXISTING_TYPES: NotificationType[] = ['request', 'follow', 'comment', 'rating', 'system', 'invitation'];

const REQUIRED_KEYS = [
    'notification.new_message',
    'notification.new_post_like',
    'notification.new_post_comment',
    'notification.generic',
] as const;

interface ApiNotification {
    id: number;
    type: string;
    title: string;
    message: string;
    reference_type: string | null;
    reference_id: number | null;
    is_read: boolean;
    link: string | null;
}

interface NotificationsBody {
    success: boolean;
    data: { notifications: ApiNotification[]; unreadCount: number };
}

function env(db: FakeD1) {
    return { DB: db } as any;
}

const sharedDb = new FakeD1();

function resetDb() {
    Object.assign(sharedDb, {
        users: [], blocks: [], sessions: [], notifications: [], conversations: [], messages: [],
        rateLimits: [], competitions: [],
        userSeq: 0, blockSeq: 0, sessionSeq: 0, notificationSeq: 0, conversationSeq: 0,
        messageSeq: 0,
    });
}

interface Setup {
    senderId: number;
    recipientId: number;
    senderSession: string;
    recipientSession: string;
}

async function setup(): Promise<Setup> {
    const users = new UserModel(sharedDb as any);
    const sessions = new SessionModel(sharedDb as any);
    const sender = await users.create({
        email: 'b9sender@test.local', username: 'b9_sender', display_name: 'B9 Sender',
    });
    const recipient = await users.create({
        email: 'b9recipient@test.local', username: 'b9_recipient', display_name: 'B9 Recipient',
    });
    const senderSession = (await sessions.create({ user_id: sender.id })).id;
    const recipientSession = (await sessions.create({ user_id: recipient.id })).id;

    sharedDb.conversations.push({
        id: CONV_ID, user1_id: sender.id, user2_id: recipient.id,
        created_at: new Date().toISOString(), last_message_at: null,
    });

    return {
        senderId: sender.id, recipientId: recipient.id,
        senderSession, recipientSession,
    };
}

function post(path: string, sessionId: string, lang: Language, body?: unknown) {
    const sep = path.includes('?') ? '&' : '?';
    return app.request(`${path}${sep}lang=${lang}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionId}`,
            'X-CSRF-Token': 'test',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(sharedDb));
}

function get(path: string, sessionId: string, lang: Language) {
    const sep = path.includes('?') ? '&' : '?';
    return app.request(`${path}${sep}lang=${lang}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${sessionId}` },
    }, env(sharedDb));
}

async function listNotifications(sessionId: string, lang: Language): Promise<NotificationsBody> {
    const res = await get('/api/notifications', sessionId, lang);
    expect(res.status).toBe(200);
    return await res.json() as NotificationsBody;
}

/** Push a raw (legacy or fixture) row straight into the fake D1 store. */
function seedRow(row: {
    id: number; user_id: number; type: string; title: string; message: string;
    reference_type?: string | null; reference_id?: number | null; created_at?: string;
}) {
    sharedDb.notifications.push({
        reference_type: null, reference_id: null, is_read: 0,
        created_at: row.created_at ?? new Date().toISOString(),
        ...row,
    });
}

describe('B9: notification types + render-time localization', () => {
    beforeEach(() => resetDb());

    it('1. sending a message stores type "message" — never "comment"', async () => {
        const s = await setup();

        const res = await post(`/api/conversations/${CONV_ID}/messages`, s.senderSession, 'ar', {
            content: 'hello over the wire',
        });
        expect(res.status).toBe(200);

        const stored = sharedDb.notifications.filter((n) => n.user_id === s.recipientId);
        expect(stored).toHaveLength(1);
        expect(stored[0].type).toBe('message');
        expect(stored[0].type).not.toBe('comment');
        expect(stored[0].reference_type).toBe('conversation');
        expect(stored[0].reference_id).toBe(CONV_ID);

        // The row is `type + payload`: no pre-translated Arabic/English label.
        expect(String(stored[0].title)).not.toMatch(/[\u0600-\u06FF]/);
        expect(String(stored[0].message)).toContain('hello over the wire');
    });

    it('2. a competition comment keeps type "comment" and is presented as a comment', async () => {
        const s = await setup();

        await new NotificationModel(sharedDb as any).create({
            user_id: s.recipientId,
            type: 'comment',
            title: 'notification.new_comment',
            payload: { actor: 'B9 Sender', preview: 'great debate' },
            reference_type: 'competition',
            reference_id: COMP_ID,
        });

        const row = sharedDb.notifications[0];
        expect(row.type).toBe('comment');
        expect(row.type).not.toBe('message');

        const body = await listNotifications(s.recipientSession, 'ar');
        const item = body.data.notifications[0];
        expect(item.type).toBe('comment');
        expect(item.title).toBe(t('notification.new_comment', 'ar'));
        expect(item.title).not.toBe('notification.new_comment');
        expect(item.link).toBe(`/competition/${COMP_ID}?lang=ar`);
    });

    it('3. the same stored row is rendered in Arabic when asked with lang=ar', async () => {
        const s = await setup();
        // Stored while the sender's UI language was English — the stored row
        // must not carry the sender's translation.
        await post(`/api/conversations/${CONV_ID}/messages`, s.senderSession, 'en', { content: 'ping' });

        const body = await listNotifications(s.recipientSession, 'ar');
        expect(body.data.notifications).toHaveLength(1);
        expect(body.data.notifications[0].title).toBe(t('notification.new_message', 'ar'));
        expect(body.data.notifications[0].title).toMatch(/[\u0600-\u06FF]/);
    });

    it('4. the very same row is rendered in English when asked with lang=en', async () => {
        const s = await setup();
        await post(`/api/conversations/${CONV_ID}/messages`, s.senderSession, 'en', { content: 'ping' });

        const ar = await listNotifications(s.recipientSession, 'ar');
        const en = await listNotifications(s.recipientSession, 'en');

        expect(en.data.notifications[0].id).toBe(ar.data.notifications[0].id);
        expect(en.data.notifications[0].title).toBe(t('notification.new_message', 'en'));
        expect(en.data.notifications[0].title).toMatch(/[A-Za-z]/);
        expect(en.data.notifications[0].title).not.toBe(ar.data.notifications[0].title);
    });

    it('5. legacy / unknown types never throw and always show understandable text', async () => {
        const s = await setup();
        // (a) genuinely unknown type with no stored label at all
        seedRow({
            id: 900001, user_id: s.recipientId, type: 'legacy_unknown_type',
            title: '', message: '', created_at: '2026-01-01T00:00:00.000Z',
        });
        // (b) the old copy/paste row: a *message* stored as type 'comment'
        seedRow({
            id: 900002, user_id: s.recipientId, type: 'comment',
            title: 'رسالة جديدة', message: 'B9 Sender: ping',
            reference_type: 'conversation', reference_id: CONV_ID,
            created_at: '2026-01-02T00:00:00.000Z',
        });

        const body = await listNotifications(s.recipientSession, 'ar');
        expect(body.data.notifications).toHaveLength(2);

        const unknown = body.data.notifications.find((n) => n.id === 900001)!;
        expect(unknown.title).toBe(t('notification.generic', 'ar'));
        expect(unknown.title).not.toBe('notification.generic');

        const oldMessage = body.data.notifications.find((n) => n.id === 900002)!;
        expect(oldMessage.title).toBe(t('notification.new_message', 'ar'));
        expect(oldMessage.message).toBe('B9 Sender: ping');
        expect(oldMessage.link).toBe(`/messages?conversation=${CONV_ID}&lang=ar`);
    });

    it('6. every notification type carries the correct deep link', async () => {
        const s = await setup();
        const payload = JSON.stringify({ actor: 'B9 Sender', username: 'b9_sender' });

        seedRow({ id: 910001, user_id: s.recipientId, type: 'message', title: 'notification.new_message', message: payload, reference_type: 'conversation', reference_id: CONV_ID, created_at: '2026-02-01T00:00:00.000Z' });
        seedRow({ id: 910002, user_id: s.recipientId, type: 'post_like', title: 'notification.new_post_like', message: payload, reference_type: 'post', reference_id: 770001, created_at: '2026-02-02T00:00:00.000Z' });
        seedRow({ id: 910003, user_id: s.recipientId, type: 'post_comment', title: 'notification.new_post_comment', message: payload, reference_type: 'post', reference_id: 770001, created_at: '2026-02-03T00:00:00.000Z' });
        seedRow({ id: 910004, user_id: s.recipientId, type: 'comment', title: 'notification.new_comment', message: payload, reference_type: 'competition', reference_id: COMP_ID, created_at: '2026-02-04T00:00:00.000Z' });
        seedRow({ id: 910005, user_id: s.recipientId, type: 'invitation', title: 'notification.competition_invite', message: payload, reference_type: 'competition', reference_id: COMP_ID, created_at: '2026-02-05T00:00:00.000Z' });
        seedRow({ id: 910006, user_id: s.recipientId, type: 'request', title: 'notification.new_join_request', message: payload, reference_type: 'competition', reference_id: COMP_ID, created_at: '2026-02-06T00:00:00.000Z' });
        seedRow({ id: 910007, user_id: s.recipientId, type: 'system', title: 'notification.system_notice', message: '', reference_type: null, reference_id: null, created_at: '2026-02-07T00:00:00.000Z' });
        seedRow({ id: 910008, user_id: s.recipientId, type: 'follow', title: 'new_follower', message: JSON.stringify({ actor: 'B9 Sender' }), reference_type: 'user', reference_id: s.senderId, created_at: '2026-02-08T00:00:00.000Z' });

        const body = await listNotifications(s.recipientSession, 'ar');
        const linkById = new Map(body.data.notifications.map((n) => [n.id, n.link]));

        expect(linkById.get(910001)).toBe(`/messages?conversation=${CONV_ID}&lang=ar`);
        expect(linkById.get(910002)).toBe('/profile/b9_sender?tab=posts&lang=ar');
        expect(linkById.get(910003)).toBe('/profile/b9_sender?tab=posts&lang=ar');
        expect(linkById.get(910004)).toBe(`/competition/${COMP_ID}?lang=ar`);
        expect(linkById.get(910005)).toBe(`/competition/${COMP_ID}?lang=ar`);
        expect(linkById.get(910006)).toBe(`/competition/${COMP_ID}?lang=ar`);
        // Types without a routable target must not invent a dead link.
        expect(linkById.get(910007)).toBeNull();
        expect(linkById.get(910008)).toBeNull();
    });

    it('7. every required type has a label rendered from its i18n key (ar + en)', async () => {
        const s = await setup();
        expect([...B9_NEW_TYPES, ...B9_EXISTING_TYPES]).toHaveLength(9);

        const cases: Array<{ type: NotificationType; key: string }> = [
            { type: 'message', key: 'notification.new_message' },
            { type: 'post_like', key: 'notification.new_post_like' },
            { type: 'post_comment', key: 'notification.new_post_comment' },
            { type: 'comment', key: 'notification.new_comment' },
            { type: 'request', key: 'notification.new_join_request' },
            { type: 'invitation', key: 'notification.competition_invite' },
            { type: 'follow', key: 'new_follower' },
            { type: 'rating', key: 'notification.new_rating' },
            { type: 'system', key: 'notification.system_notice' },
        ];

        cases.forEach((entry, i) => {
            seedRow({
                id: 920000 + i, user_id: s.recipientId, type: entry.type, title: entry.key,
                message: '', created_at: `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
            });
        });

        for (const lang of ['ar', 'en'] as Language[]) {
            const body = await listNotifications(s.recipientSession, lang);
            cases.forEach((entry, i) => {
                const item = body.data.notifications.find((n) => n.id === 920000 + i)!;
                expect(item.title, `${entry.type} (${lang})`).toBe(t(entry.key, lang));
                expect(item.title, `${entry.type} (${lang})`).not.toBe(entry.key);
            });
        }
    });

    it('8. required B9 i18n keys exist and differ per language', () => {
        for (const key of REQUIRED_KEYS) {
            const ar = t(key, 'ar');
            const en = t(key, 'en');
            expect(ar, `${key} (ar)`).toBeTruthy();
            expect(en, `${key} (en)`).toBeTruthy();
            expect(ar, `${key} must not resolve to the raw key`).not.toBe(key);
            expect(en, `${key} must not resolve to the raw key`).not.toBe(key);
            expect(ar, `${key} must differ ar/en`).not.toBe(en);
        }
    });
});
