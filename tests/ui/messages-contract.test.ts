/**
 * R1.3 — /messages readers must match the GET conversations/messages
 * contract (P13-001 / historical Root-2, still live).
 *
 * The API envelope (BaseController.success + MessageController) is:
 *   GET /api/conversations          -> { success, data: { conversations: [...] } }
 *   GET /api/conversations/:id/msgs -> { success, data: { messages: [...] } }
 * with FLAT conversation rows (other_user_id / other_username /
 * other_display_name / other_avatar / last_message / unread_count —
 * see ConversationModel.getUserConversations, pinned by
 * tests/e2e/beta-core-path.spec.ts).
 *
 * The page treated `data.data` itself as an array and read a nested
 * `conv.other_user?.{username,avatar_url,display_name}` that the API
 * never returns — so the list always fell through to "No conversations
 * yet" and the thread to "No messages yet" despite working backend.
 *
 * Node-only: source-contract assertions + evaluation of the page's OWN
 * collection expressions against real-shape fixtures (no copies of the
 * logic — the expressions are extracted from the page source and run).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

const PAGE = 'src/modules/pages/messages-page.ts';

/** Real-shape fixtures (mirror ConversationModel / MessageModel rows). */
const CONV_ROW = {
    id: 7,
    user1_id: 9,
    user2_id: 2,
    last_message_at: null,
    created_at: '2026-09-20T10:00:00.000Z',
    other_user_id: 2,
    other_username: 'eng_alaa',
    other_display_name: 'Eng Alaa',
    other_avatar: null,
    last_message: 'مرحبا بك',
    unread_count: 2,
};
const MSG_ROW = {
    id: 11,
    conversation_id: 7,
    sender_id: 2,
    receiver_id: 9,
    content: 'مرحبا بك',
    is_read: 0,
    read_at: null,
    created_at: '2026-09-20T10:01:00.000Z',
};
const fullConvPayload = { success: true, data: { conversations: [CONV_ROW] } };
const emptyConvPayload = { success: true, data: { conversations: [] } };
const fullMsgPayload = { success: true, data: { messages: [MSG_ROW] } };
const emptyMsgPayload = { success: true, data: { messages: [] } };

/** Extract the page's own collection expression and run it. */
function evalPageCollection(src: string, name: 'conversations' | 'messages', data: unknown): unknown[] {
    const matches = [...src.matchAll(new RegExp(`const ${name} = ([^;]+);`, 'g'))].map((m) => m[1]);
    expect(matches, `page must define exactly one "const ${name} = …" collection`).toHaveLength(1);
    return new Function('data', `return (${matches[0]});`)(data) as unknown[];
}

describe('R1.3 /messages API-contract readers (P13-001)', () => {
    it('reads the conversations envelope (data.data.conversations), never data.data as an array', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('data.data?.conversations');
        expect(src, 'bare data.data.map (array treatment) must be gone').not.toContain('data.data.map');
        expect(src, 'bare data.data?.length (array treatment) must be gone').not.toContain('data.data?.length');
    });

    it('reads the messages envelope (data.data.messages)', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('data.data?.messages');
    });

    it('maps the FLAT conversation row fields (no nested other_user object)', () => {
        const src = readSrc(PAGE);
        for (const field of ['other_username', 'other_avatar', 'other_display_name']) {
            expect(src, `page must map flat field ${field}`).toContain(field);
        }
        expect(src, 'nested other_user?. access (never returned by API) must be gone').not.toContain('other_user?.');
    });

    it('resolves a non-empty contract payload to a renderable list (list + thread)', () => {
        const src = readSrc(PAGE);
        const convs = evalPageCollection(src, 'conversations', fullConvPayload);
        expect(Array.isArray(convs)).toBe(true);
        expect(convs).toHaveLength(1);
        expect((convs[0] as typeof CONV_ROW).other_username).toBe('eng_alaa');
        const msgs = evalPageCollection(src, 'messages', fullMsgPayload);
        expect(Array.isArray(msgs)).toBe(true);
        expect(msgs).toHaveLength(1);
        expect((msgs[0] as typeof MSG_ROW).content).toBe('مرحبا بك');
    });

    it('resolves an empty contract payload to [] (empty-state path, no throw)', () => {
        const src = readSrc(PAGE);
        expect(evalPageCollection(src, 'conversations', emptyConvPayload)).toEqual([]);
        expect(evalPageCollection(src, 'messages', emptyMsgPayload)).toEqual([]);
    });
});
