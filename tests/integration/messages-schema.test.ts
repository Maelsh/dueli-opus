import { beforeAll, describe, expect, it } from 'vitest';
import {
    applyMigrationFiles,
    applyMigrationsViaWrangler,
    execD1,
    listMigrationFileNames,
    queryD1,
    wipeTestState,
    type D1ResultRow,
} from './helpers/wrangler-d1-runner.mjs';

/**
 * B1 — Core Messaging schema contract on real D1 (via Wrangler CLI).
 *
 * Proves the messages/conversations alignment introduced by
 * migrations/0014_messages_conversation_alignment.sql:
 *  - full migration set applies from an empty isolated D1
 *  - message create/read/mark-as-read/unread-count contract
 *  - A/B-only conversation ownership (user C is denied)
 *  - legacy sender/receiver/is_read rows are backfilled into conversations
 */

const USER_A = 910001;
const USER_B = 910002;
const USER_C = 910003;
const MIGRATION_0014 = '0014_messages_conversation_alignment.sql';

interface TableInfoRow {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
}

interface MessageRow {
    id: number;
    conversation_id: number | null;
    sender_id: number;
    receiver_id: number | null;
    content: string;
    is_read: number;
    read_at: string | null;
    created_at: string;
}

interface ConversationRow {
    id: number;
    user1_id: number;
    user2_id: number;
}

function asTableInfoRows(rows: D1ResultRow[]): TableInfoRow[] {
    return rows as unknown as TableInfoRow[];
}

function insertUser(id: number, tag: string) {
    execD1(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_verified) ` +
        `VALUES (${id}, 'b1-${tag}@test.local', 'b1_${tag}', 'x', 'B1 ${tag}', 1)`,
    );
}

/**
 * Mirror of the exact write contract MessageModel must satisfy after B1:
 * every column it writes exists, and the receiver is derived from the
 * conversation — the caller never supplies receiver_id from untrusted input.
 */
function insertMessage(conversationId: number, senderId: number, receiverId: number, content: string) {
    execD1(
        `INSERT INTO messages (conversation_id, sender_id, receiver_id, content, is_read, read_at, created_at) ` +
        `VALUES (${conversationId}, ${senderId}, ${receiverId}, '${content}', 0, NULL, '2026-09-08 10:00:00')`,
    );
}

/** Mirror of ConversationModel.findOrCreate normalization (min, max). */
function getOrCreateConversation(user1: number, user2: number): number {
    const [minId, maxId] = user1 < user2 ? [user1, user2] : [user2, user1];
    execD1(
        `INSERT OR IGNORE INTO conversations (user1_id, user2_id, created_at) ` +
        `VALUES (${minId}, ${maxId}, '2026-09-08 10:00:00')`,
    );
    const rows = queryD1(
        `SELECT id, user1_id, user2_id FROM conversations WHERE user1_id = ${minId} AND user2_id = ${maxId}`,
    ) as unknown as ConversationRow[];
    expect(rows).toHaveLength(1);
    return rows[0].id;
}

/** Mirror of MessageModel.markAsRead — includes the model-level membership guard. */
function markConversationRead(conversationId: number, readerId: number) {
    const member = queryD1(
        `SELECT 1 FROM conversations WHERE id = ${conversationId} ` +
            `AND (user1_id = ${readerId} OR user2_id = ${readerId})`,
    );
    if (!member || member.length === 0) {
        return;
    }
    execD1(
        `UPDATE messages SET is_read = 1, read_at = '2026-09-08 11:00:00' ` +
            `WHERE conversation_id = ${conversationId} AND sender_id != ${readerId} AND read_at IS NULL`,
    );
}

function unreadCount(userId: number, conversationId?: number): number {
    const rows = queryD1(
        `SELECT COUNT(*) as count FROM messages WHERE receiver_id = ${userId} AND is_read = 0` +
        (conversationId ? ` AND conversation_id = ${conversationId}` : ''),
    ) as unknown as { count: number }[];
    return rows[0]?.count ?? 0;
}

let messagesColumns: string[] = [];

describe('B1 — messages schema alignment (0014) on real D1', () => {
    beforeAll(() => {
        applyMigrationsViaWrangler();
        insertUser(USER_A, 'a');
        insertUser(USER_B, 'b');
        insertUser(USER_C, 'c');
        messagesColumns = asTableInfoRows(queryD1('PRAGMA table_info(messages)')).map((r) => r.name);
    });

    it('applies the full migration set from an empty isolated D1', () => {
        expect(listMigrationFileNames()).toContain(MIGRATION_0014);
    });

    it('messages has the aligned columns: conversation_id, sender_id, receiver_id, content, is_read, read_at, created_at', () => {
        for (const col of [
            'id',
            'conversation_id',
            'sender_id',
            'receiver_id',
            'content',
            'is_read',
            'read_at',
            'created_at',
        ]) {
            expect(messagesColumns, `missing column messages.${col}`).toContain(col);
        }
    });

    it('adds the required indexes: (conversation_id, created_at) and (receiver_id, is_read)', () => {
        const indexes = queryD1(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'messages'",
        ) as unknown as { name: string }[];
        const names = indexes.map((i) => i.name);
        expect(names).toContain('idx_messages_conversation_created');
        expect(names).toContain('idx_messages_receiver_unread');
    });

    it('creates a message from A to B with correct conversation_id, is_read = 0 and read_at = NULL', () => {
        const conversationId = getOrCreateConversation(USER_A, USER_B);
        insertMessage(conversationId, USER_A, USER_B, 'hello B');

        const rows = queryD1(
            `SELECT * FROM messages WHERE conversation_id = ${conversationId} AND sender_id = ${USER_A}`,
        ) as unknown as MessageRow[];
        expect(rows).toHaveLength(1);
        const msg = rows[0];
        expect(msg.conversation_id).toBe(conversationId);
        expect(msg.receiver_id).toBe(USER_B);
        expect(msg.is_read).toBe(0);
        expect(msg.read_at).toBeNull();
    });

    it('fetching conversation messages returns the created message', () => {
        const conversationId = getOrCreateConversation(USER_A, USER_B);
        const rows = queryD1(
            `SELECT m.*, u.username as sender_username ` +
            `FROM messages m JOIN users u ON m.sender_id = u.id ` +
            `WHERE m.conversation_id = ${conversationId} ORDER BY m.created_at DESC`,
        ) as unknown as (MessageRow & { sender_username: string })[];
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].sender_username).toBe('b1_a');
        expect(rows[0].receiver_id).toBe(USER_B);
    });

    it('B marks the conversation read: is_read = 1 and read_at set; unread count 1 -> 0', () => {
        const conversationId = getOrCreateConversation(USER_A, USER_B);
        insertMessage(conversationId, USER_A, USER_B, 'second message');

        expect(unreadCount(USER_B, conversationId)).toBeGreaterThanOrEqual(1);

        markConversationRead(conversationId, USER_B);

        const rows = queryD1(
            `SELECT is_read, read_at FROM messages WHERE conversation_id = ${conversationId} AND sender_id = ${USER_A}`,
        ) as unknown as { is_read: number; read_at: string | null }[];
        expect(rows.length).toBeGreaterThanOrEqual(1);
        for (const row of rows) {
            expect(row.is_read).toBe(1);
            expect(row.read_at).not.toBeNull();
        }
        expect(unreadCount(USER_B, conversationId)).toBe(0);
    });

    it('A and B have access to the conversation; user C does not', () => {
        const conversationId = getOrCreateConversation(USER_A, USER_B);
        const accessRows = queryD1(
            `SELECT id FROM conversations WHERE id = ${conversationId} ` +
            `AND (user1_id = ${USER_A} OR user2_id = ${USER_A})`,
        );
        expect(accessRows).toHaveLength(1);

        const accessRowsB = queryD1(
            `SELECT id FROM conversations WHERE id = ${conversationId} ` +
            `AND (user1_id = ${USER_B} OR user2_id = ${USER_B})`,
        );
        expect(accessRowsB).toHaveLength(1);

        const accessRowsC = queryD1(
            `SELECT id FROM conversations WHERE id = ${conversationId} ` +
            `AND (user1_id = ${USER_C} OR user2_id = ${USER_C})`,
        );
        expect(accessRowsC).toHaveLength(0);
    });

    it('C cannot mark the A/B conversation read: rows keep original is_read/read_at (model-level guard)', () => {
        const conversationId = getOrCreateConversation(USER_A, USER_B);
        insertMessage(conversationId, USER_A, USER_B, 'protected message');

        const before = queryD1(
            `SELECT is_read, read_at FROM messages WHERE content = 'protected message'`,
        ) as unknown as { is_read: number; read_at: string | null }[];
        expect(before).toHaveLength(1);
        expect(before[0].is_read).toBe(0);
        expect(before[0].read_at).toBeNull();

        // C is NOT a participant — markAsRead must be a no-op at the model level.
        markConversationRead(conversationId, USER_C);

        const after = queryD1(
            `SELECT is_read, read_at FROM messages WHERE content = 'protected message'`,
        ) as unknown as { is_read: number; read_at: string | null }[];
        expect(after).toHaveLength(1);
        expect(after[0].is_read).toBe(0);
        expect(after[0].read_at).toBeNull();

        // B (the real participant) can still mark it read.
        markConversationRead(conversationId, USER_B);
        const afterB = queryD1(
            `SELECT is_read, read_at FROM messages WHERE content = 'protected message'`,
        ) as unknown as { is_read: number; read_at: string | null }[];
        expect(afterB).toHaveLength(1);
        expect(afterB[0].is_read).toBe(1);
        expect(afterB[0].read_at).not.toBeNull();
        expect(unreadCount(USER_B, conversationId)).toBe(0);
    });

    it('C cannot read messages in the A/B conversation', () => {
        const conversationId = getOrCreateConversation(USER_A, USER_B);
        // Reading through C's membership predicate yields nothing.
        const readAsC = queryD1(
            `SELECT m.id FROM messages m ` +
            `JOIN conversations c ON m.conversation_id = c.id ` +
            `WHERE c.id = ${conversationId} AND (c.user1_id = ${USER_C} OR c.user2_id = ${USER_C})`,
        );
        expect(readAsC).toHaveLength(0);
    });

    describe('0014 backfill — legacy messages without conversation_id', () => {
        const LEGACY_A = 920001;
        const LEGACY_B = 920002;
        const LEGACY_C = 920003;

        it('links legacy sender/receiver/is_read rows to the correct conversation and backfills read_at', () => {
            // Isolated state on the pre-0014 schema only (migrations 0001–0013
            // as-is via Wrangler CLI), then legacy fixture, then 0014 only.
            wipeTestState();
            const pre0014 = listMigrationFileNames().filter((f) => f !== MIGRATION_0014);
            applyMigrationFiles(pre0014);

            insertUser(LEGACY_A, 'la');
            insertUser(LEGACY_B, 'lb');
            insertUser(LEGACY_C, 'lc');

            // Legacy rows on the old schema: no conversation_id / read_at.
            execD1(
                `INSERT INTO messages (sender_id, receiver_id, content, is_read, created_at) ` +
                `VALUES (${LEGACY_A}, ${LEGACY_B}, 'legacy read', 1, '2026-08-01 09:00:00')`,
            );
            execD1(
                `INSERT INTO messages (sender_id, receiver_id, content, is_read, created_at) ` +
                `VALUES (${LEGACY_B}, ${LEGACY_A}, 'legacy unread', 0, '2026-08-01 09:30:00')`,
            );
            execD1(
                `INSERT INTO messages (sender_id, receiver_id, content, is_read, created_at) ` +
                `VALUES (${LEGACY_C}, ${LEGACY_A}, 'legacy from c', 0, '2026-08-02 09:00:00')`,
            );

            applyMigrationFiles([MIGRATION_0014]);

            // One conversation per legacy correspondent pair, normalized min/max.
            const ab = queryD1(
                `SELECT id FROM conversations WHERE user1_id = ${LEGACY_A} AND user2_id = ${LEGACY_B}`,
            ) as unknown as ConversationRow[];
            expect(ab).toHaveLength(1);

            const ca = queryD1(
                `SELECT id FROM conversations WHERE user1_id = ${LEGACY_A} AND user2_id = ${LEGACY_C}`,
            ) as unknown as ConversationRow[];
            expect(ca).toHaveLength(1);

            const abRows = queryD1(
                `SELECT * FROM messages WHERE sender_id = ${LEGACY_A} AND receiver_id = ${LEGACY_B}`,
            ) as unknown as MessageRow[];
            expect(abRows).toHaveLength(1);
            expect(abRows[0].conversation_id).toBe(ab[0].id);
            // read_at backfilled from is_read = 1
            expect(abRows[0].read_at).not.toBeNull();

            const baRows = queryD1(
                `SELECT * FROM messages WHERE sender_id = ${LEGACY_B} AND receiver_id = ${LEGACY_A}`,
            ) as unknown as MessageRow[];
            expect(baRows).toHaveLength(1);
            expect(baRows[0].conversation_id).toBe(ab[0].id);
            // is_read = 0 keeps read_at NULL
            expect(baRows[0].read_at).toBeNull();

            const caRows = queryD1(
                `SELECT * FROM messages WHERE sender_id = ${LEGACY_C} AND receiver_id = ${LEGACY_A}`,
            ) as unknown as MessageRow[];
            expect(caRows).toHaveLength(1);
            expect(caRows[0].conversation_id).toBe(ca[0].id);

            // Legacy columns are preserved, never dropped.
            const legacyCols = asTableInfoRows(queryD1('PRAGMA table_info(messages)')).map((r) => r.name);
            for (const col of ['sender_id', 'receiver_id', 'is_read', 'created_at']) {
                expect(legacyCols).toContain(col);
            }

            // Restore the standard full-migration state for other suites.
            wipeTestState();
            applyMigrationsViaWrangler();
        });
    });
});
