import { beforeAll, describe, expect, it } from 'vitest';
import { CommentModel } from '../../src/models/CommentModel';
import { RatingModel } from '../../src/models/RatingModel';
import { ConversationModel, MessageModel } from '../../src/models/MessageModel';
import { UserBlockModel } from '../../src/models/UserBlockModel';
import { BlockedInteractionError } from '../../src/lib/errors/AppError';
import {
    applyMigrationsViaWrangler,
    execD1,
    queryD1,
    readRepoFile,
    runD1Write,
} from './helpers/wrangler-d1-runner.mjs';

/* B6 — user blocks enforced centrally across messages, comments, follows
 * and ratings, on real D1 via Wrangler CLI (real models, real SQL, no
 * duplicated user_blocks queries — everything goes through
 * UserBlockModel.isBlockedBetween). */

function esc(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${String(v).replace(/'/g, "''")}'`;
}

function makeRealD1(): D1Database {
    const fill = (sql: string, params: unknown[]) => {
        let i = 0;
        return sql.replace(/\?/g, () => esc(params[i++]));
    };
    const db = {
        prepare(sql: string) {
            let params: unknown[] = [];
            const stmt = {
                bind(...p: unknown[]) { params = p; return stmt; },
                async run() {
                    const m = runD1Write(fill(sql, params));
                    const meta: Record<string, unknown> = {};
                    if (typeof m.changes === 'number') meta['changes'] = m.changes;
                    if (typeof m.lastRowId === 'number') meta['last_row_id'] = m.lastRowId;
                    return { success: true, meta };
                },
                async first() {
                    const rows = queryD1(fill(sql, params)) as Record<string, unknown>[];
                    return (rows[0] ?? null) as unknown;
                },
                async all() {
                    const rows = queryD1(fill(sql, params)) as Record<string, unknown>[];
                    return { results: rows } as unknown;
                },
            };
            return stmt;
        },
    };
    return db as unknown as D1Database;
}

// B6 test users, all in the 820xxx id range to avoid clashing with other
// integration suites sharing the same local D1 state.
const A = 820001; // blocker
const B = 820002; // blocked
const C = 820003; // unrelated, unblocked control

function seedAll() {
    execD1(`INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (${A}, 'b6-a@test.local', 'b6_a', 'x', 'B6 A', 1);`);
    execD1(`INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (${B}, 'b6-b@test.local', 'b6_b', 'x', 'B6 B', 1);`);
    execD1(`INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (${C}, 'b6-c@test.local', 'b6_c', 'x', 'B6 C', 1);`);
    execD1(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (820001, 'b6cat', 'B6', 'B6 Cat');`);
    // Competition created by A — used for comment/rating scenarios.
    execD1(`INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type) VALUES (820001, 'B6 comp', 'rules', 820001, ${A}, ${B}, 'completed', 'scheduled');`);
    // A blocks B.
    execD1(`INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (${A}, ${B}, 'test', datetime('now'));`);
}

function ctrlSrc(path: string): Promise<string> {
    return readRepoFile(path);
}

describe('B6 central block enforcement (real D1 + real models)', () => {
    let commentModel: CommentModel;
    let ratingModel: RatingModel;
    let conversationModel: ConversationModel;
    let messageModel: MessageModel;
    let blockModel: UserBlockModel;

    beforeAll(() => {
        applyMigrationsViaWrangler();
        const db = makeRealD1();
        commentModel = new CommentModel(db);
        ratingModel = new RatingModel(db);
        conversationModel = new ConversationModel(db);
        messageModel = new MessageModel(db);
        blockModel = new UserBlockModel(db);
        seedAll();
    });

    it('1. A blocked B -> B starting a conversation with A is rejected, no row written', async () => {
        await expect(conversationModel.findOrCreate(B, A)).rejects.toBeInstanceOf(BlockedInteractionError);
        const rows = queryD1(`SELECT COUNT(*) as n FROM conversations WHERE (user1_id = ${A} AND user2_id = ${B}) OR (user1_id = ${B} AND user2_id = ${A})`) as { n: number }[];
        expect(rows[0].n).toBe(0);
    });

    it('2. Direction is bidirectional: A trying to message B is rejected too', async () => {
        await expect(conversationModel.findOrCreate(A, B)).rejects.toBeInstanceOf(BlockedInteractionError);
    });

    it('3. A blocked B -> B commenting on A\'s competition is rejected, no row written', async () => {
        await expect(
            commentModel.create({ competition_id: 820001, user_id: B, content: 'hi', is_live: false })
        ).rejects.toBeInstanceOf(BlockedInteractionError);
        const rows = queryD1(`SELECT COUNT(*) as n FROM comments WHERE competition_id = 820001 AND user_id = ${B}`) as { n: number }[];
        expect(rows[0].n).toBe(0);
    });

    it('4. A blocked B -> B rating A is rejected, no row written', async () => {
        await expect(ratingModel.create(820001, B, A, 5)).rejects.toBeInstanceOf(BlockedInteractionError);
        const rows = queryD1(`SELECT COUNT(*) as n FROM ratings WHERE competition_id = 820001 AND user_id = ${B} AND competitor_id = ${A}`) as { n: number }[];
        expect(rows[0].n).toBe(0);
    });

    it('5. Follow guard is wired centrally through UserBlockModel.isBlockedBetween in UserController', async () => {
        const src = await ctrlSrc('src/controllers/UserController.ts');
        expect(src).toContain('isBlockedBetween(followerId, followingId)');
        expect(src).toContain('BlockedInteractionError');
        const guardIdx = src.indexOf('isBlockedBetween(followerId, followingId)');
        const insertIdx = src.indexOf('INSERT OR IGNORE INTO follows');
        expect(guardIdx).toBeGreaterThan(-1);
        expect(insertIdx).toBeGreaterThan(guardIdx);
    });

    it('6. Unrelated pair (no block) -> comment, rating and conversation all succeed', async () => {
        const comment = await commentModel.create({ competition_id: 820001, user_id: C, content: 'gg', is_live: false });
        expect(comment.id).toBeGreaterThan(0);

        const rating = await ratingModel.create(820001, C, A, 4);
        expect(rating.id).toBeGreaterThan(0);

        const conversation = await conversationModel.findOrCreate(A, C);
        expect(conversation.id).toBeGreaterThan(0);
    });

    it('7. Message-level guard also fires on an existing conversation created before the block', async () => {
        const conv = await conversationModel.findOrCreate(C, B);
        expect(conv.id).toBeGreaterThan(0);
        execD1(`INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (${C}, ${B}, 'test', datetime('now'));`);
        await expect(
            messageModel.create({ conversation_id: conv.id, sender_id: B, content: 'still there?' })
        ).rejects.toBeInstanceOf(BlockedInteractionError);
        const rows = queryD1(`SELECT COUNT(*) as n FROM messages WHERE conversation_id = ${conv.id}`) as { n: number }[];
        expect(rows[0].n).toBe(0);
    });

    it('8. isBlockedBetween is the single source of truth (unit-level sanity)', async () => {
        expect(await blockModel.isBlockedBetween(A, B)).toBe(true);
        expect(await blockModel.isBlockedBetween(B, A)).toBe(true);
        expect(await blockModel.isBlockedBetween(A, C)).toBe(false);
    });
});
