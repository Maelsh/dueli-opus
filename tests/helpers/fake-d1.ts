/**
 * Minimal in-memory D1 fake for unit tests.
 * Implements only the query shapes used by UserModel / UserBlockModel /
 * SessionModel / AuthController / profilePage / CompetitionModel.findByUser.
 */

import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

type Row = Record<string, any>;

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const ok = (meta: { last_row_id: number | null; changes: number }) => ({ success: true, meta });

export class FakeD1 implements D1Database {
    users: Row[] = [];
    blocks: Row[] = [];
    sessions: Row[] = [];
    donations: Row[] = [];
    competitions: Row[] = [];
    conversations: Row[] = [];
    messages: Row[] = [];
    requests: Row[] = [];
    ratings: Row[] = [];
    invitations: Row[] = [];
    notifications: Row[] = [];
    sseEvents: Row[] = [];
    sseSeq = 0;
    // B7: comments + rate_limits support for rate-limits tests
    comments: Row[] = [];
    rateLimits: Row[] = [];
    userSeq = 0;
    blockSeq = 0;
    donationSeq = 0;
    competitionSeq = 0;
    conversationSeq = 0;
    messageSeq = 0;
    ratingSeq = 0;
    invitationSeq = 0;
    notificationSeq = 0;
    commentSeq = 0;

    prepare(sql: string): FakeStmt {
        return new FakeStmt(this, sql);
    }

    /**
     * Execute a batch of prepared statements atomically.
     * Each statement must already be bound before passing here.
     * B7: SELECT statements return { results: [row] } like real D1 so
     * RateLimitService can read the counter back from the batch result.
     */
    async batch(statements: D1PreparedStatement[]): Promise<{ success: boolean; meta: { changes: number; last_row_id: number | null }; results?: Row[] }[]> {
        const results: { success: boolean; meta: { changes: number; last_row_id: number | null }; results?: Row[] }[] = [];
        for (const stmt of statements) {
            const fakeStmt = stmt as unknown as FakeStmt;
            const q = norm(fakeStmt.sql);
            if (q.startsWith('select')) {
                const row = await fakeStmt.first();
                results.push({ success: true, meta: { changes: 0, last_row_id: null }, results: row ? [row] : [] });
            } else {
                const result = await fakeStmt.run();
                results.push(result);
            }
        }
        return results;
    }
}

class FakeStmt {
    private params: any[] = [];

    constructor(
        private db: FakeD1,
        readonly sql: string
    ) {}

    bind(...params: any[]): this {
        this.params = params;
        return this;
    }

    async first(): Promise<Row | null> {
        const q = norm(this.sql);
        const p = this.params;

        // --- sessions (create/find for auth in B5-2 error-path tests) ---
        if (q.startsWith('insert into sessions')) {
            const row: Row = {
                id: p[0] ?? `sess-${this.db.sessions.length + 1}`,
                user_id: p[1],
                expires_at: p[2],
                created_at: new Date().toISOString(),
            };
            this.db.sessions.push(row);
            return row;
        }
        if (q.startsWith('select * from users where id = ? and is_active = 1')) {
            return this.db.users.find((u) => u.id === p[0] && u.is_active === 1) ?? null;
        }
        if (q.startsWith('select * from users where id = ?')) {
            return this.db.users.find((u) => u.id === p[0]) ?? null;
        }
        if (q.startsWith('select * from users where email = ?')) {
            return this.db.users.find((u) => u.email === p[0]) ?? null;
        }
        if (q.startsWith('select * from users where username = ?')) {
            return this.db.users.find((u) => u.username === p[0]) ?? null;
        }
        if (q.startsWith('select * from users where verification_token = ?')) {
            return this.db.users.find((u) => u.verification_token === p[0]) ?? null;
        }
        if (q.startsWith('select count(*) as count from users where email = ?')) {
            return { count: this.db.users.filter((u) => u.email === p[0]).length };
        }
        if (q.startsWith('select count(*) as count from users where username = ?')) {
            return { count: this.db.users.filter((u) => u.username === p[0]).length };
        }

        // --- follows stats (no follows table in fake -> zeros) ---
        if (q.includes('from follows')) {
            if (q.startsWith('select count(')) return { count: 0 };
            if (q.startsWith('select 1 from follows')) return null;
        }

        // --- donations ---
        if (q.startsWith('select * from donations where id = ?')) {
            return this.db.donations.find((d) => d.id === p[0]) ?? null;
        }

// --- competitions (minimal: findById for B5-2 error-path tests) ---
        if (q.startsWith('select * from competitions where id = ?')) {
            return this.db.competitions.find((c) => c.id === p[0]) ?? null;
        }
        // B6: CommentModel.create queries creator_id only (not all columns)
        if (q.startsWith('select creator_id from competitions where id = ?')) {
            const comp = this.db.competitions.find((c) => c.id === p[0]);
            return comp ? { creator_id: comp.creator_id } : null;
        }

        // --- B7: comments ---
        if (q.startsWith('select * from comments where id = ?')) {
            return this.db.comments.find((cm) => cm.id === p[0]) ?? null;
        }

        // --- B2+B3: visible comment counts ---
        if (q.startsWith('select count(*) as n from comments')) {
            const compId = p[0];
            let rows = this.db.comments.filter((c) => c.competition_id === compId && !c.deleted_at);
            if (q.includes('parent_id is null')) rows = rows.filter((c) => c.parent_id == null);
            else if (q.includes('parent_id = ?')) rows = rows.filter((c) => c.parent_id === p[1]);
            return { n: rows.length };
        }

        // --- B2+B3: light competition counts ---
        if (q.startsWith('select count(*) as n from competition_requests')) {
            const n = this.db.requests.filter((r) => r.competition_id === p[0] && r.status === 'pending').length;
            return { n };
        }
        if (q.startsWith('select count(*) as n from ratings')) {
            const n = this.db.ratings.filter((r) => r.competition_id === p[0]).length;
            return { n };
        }

        // --- B2+B3: competition details join ---
        if (q.includes('from competitions c') && q.includes('join categories cat')) {
            const comp = this.db.competitions.find((c) => c.id === p[0]);
            if (!comp) return null;
            const creator = this.db.users.find((u) => u.id === comp.creator_id) ?? {};
            const opponent = this.db.users.find((u) => u.id === comp.opponent_id) ?? {};
            return {
                ...comp,
                category_name_ar: 'x', category_name_en: 'x', category_slug: 'x',
                creator_name: creator.display_name, creator_username: creator.username, creator_avatar: creator.avatar_url,
                opponent_name: opponent.display_name, opponent_username: opponent.username, opponent_avatar: opponent.avatar_url,
            };
        }

        // --- B7: rate_limits (RateLimitService read-back) ---
        if (q.startsWith('select count from rate_limits where key = ? and window_start = ?')) {
            const hit = this.db.rateLimits.find(
                (r) => r.key === p[0] && r.window_start === p[1]
            );
            return hit ? { count: hit.count } : null;
        }

        // --- conversations ---
        if (q.startsWith('select * from conversations where id = ?')) {
            return this.db.conversations.find((c: any) => c.id === p[0]) ?? null;
        }
        if (q.startsWith('select user1_id, user2_id from conversations where id = ?')) {
            const conv = this.db.conversations.find((c: any) => c.id === p[0]);
            if (!conv) return null;
            return { user1_id: conv.user1_id, user2_id: conv.user2_id };
        }
        if (q.startsWith('select 1 from conversations')) {
            const conv = this.db.conversations.find((c: any) => c.id === p[0]);
            if (conv) return { '1': 1 };
            return null;
        }
        // findOrCreate: SELECT * FROM conversations WHERE (user1_id = ? AND user2_id = ?) OR ...
        if (q.startsWith('select * from conversations where (user1_id = ?')) {
            const [minId, maxId] = p;
            const conv = this.db.conversations.find((c: any) =>
                (c.user1_id === minId && c.user2_id === maxId) ||
                (c.user1_id === maxId && c.user2_id === minId)
            );
            return conv ?? null;
        }

        // --- ratings ---
        if (q.startsWith('select 1 from ratings')) {
            const hit = this.db.ratings.find(
                (r) => r.competition_id === p[0] && r.user_id === p[1] && r.competitor_id === p[2]
            );
            return hit ? { '1': 1 } : null;
        }


        // --- invitations: check existing pending invitation ---
        if (q.includes('from competition_invitations') && q.includes("status = 'pending'") && q.includes('invitee_id = ?')) {
            if (q.startsWith('select id from competition_invitations')) {
                const hit = this.db.invitations.find(
                    (i) => i.competition_id === p[0] && i.invitee_id === p[1] && i.status === 'pending'
                );
                return hit ? { id: hit.id } : null;
            }
            // SELECT * FROM competition_invitations (full row for accept)
            if (q.startsWith('select * from competition_invitations')) {
                return this.db.invitations.find(
                    (i) => i.competition_id === p[0] && i.invitee_id === p[1] && i.status === 'pending'
                ) ?? null;
            }
        }

        // --- invitations: count pending ---
        if (q.startsWith('select count(*)') && q.includes('from competition_invitations')) {
            const count = this.db.invitations.filter(
                (i) => i.competition_id === p[0] && i.status === 'pending'
            ).length;
            return { count };
        }

        // --- notifications: count by user+type ---
        if (q.startsWith('select count(*)') && q.includes('from notifications')) {
            const count = this.db.notifications.filter(
                (n) => n.user_id === p[0] && n.type === p[1]
            ).length;
            return { count };
        }

        // --- sessions ---
        if (q.startsWith('select * from sessions where id = ?')) {
            const hit = this.db.sessions.find((s) => s.id === p[0]);
            if (hit) {
                const now = new Date().toISOString();
                if (hit.expires_at && hit.expires_at <= now) return null;
            }
            return hit ?? null;
        }

        // --- user_blocks ---
        if (q.startsWith('select 1 from user_blocks')) {
            const [a, b, c2, d] = p;
            const hit = this.db.blocks.find(
                (r) =>
                    (r.blocker_id === a && r.blocked_id === b) ||
                    (r.blocker_id === c2 && r.blocked_id === d)
            );
            return hit ? { '1': 1 } : null;
        }
        if (q.startsWith('select * from user_blocks where id = ?')) {
            return this.db.blocks.find((r) => r.id === p[0]) ?? null;
        }
        if (q.includes('from user_blocks b')) {
            // getBlockedUsers / getBlockedBy (JOIN users) — return joined rows
            const id = p[0];
            const isBlockerSide = q.includes('where b.blocker_id = ?');
            const rows = this.db.blocks.filter((r) =>
                isBlockerSide ? r.blocker_id === id : r.blocked_id === id
            );
            return null as unknown as Row; // handled in all()
        }

        return null;
    }

    async all(): Promise<{ results: Row[] }> {
        const q = norm(this.sql);
        const p = this.params;

        // --- comments (B2+B3: paged + replies_count + soft-delete aware) ---
        if (q.includes('from comments c') && q.includes('join users u')) {
            const hasParent = q.includes('c.parent_id = ?');
            const compId = p[0];
            const parentVal = hasParent ? p[1] : undefined;
            const limIdx = hasParent ? 2 : 1;
            const offIdx = hasParent ? 3 : 2;
            let rows = this.db.comments.filter((c) => {
                if (c.competition_id !== compId) return false;
                if (c.deleted_at) return false;
                if (hasParent) return c.parent_id === parentVal;
                if (q.includes('c.parent_id is null')) return c.parent_id == null;
                return true;
            });
            rows = rows.map((c) => {
                const u = this.db.users.find((x) => x.id === c.user_id) ?? {};
                const replies_count = this.db.comments.filter(
                    (r) => r.parent_id === c.id && !r.deleted_at
                ).length;
                return { ...c, display_name: u.display_name, avatar_url: u.avatar_url, username: u.username, replies_count };
            }).sort((a, b) => new Date((b as Row).created_at).getTime() - new Date((a as Row).created_at).getTime());
            const lim = p[limIdx] as number;
            const off = p[offIdx] as number;
            if (Number.isFinite(lim) && Number.isFinite(off)) rows = rows.slice(off, off + lim);
            return { results: rows };
        }
        // --- ratings with user details (JOIN) ---
        if (q.includes('from ratings r') && q.includes('join users u')) {
            const competitionId = p[0];
            const rows = this.db.ratings
                .filter((r) => r.competition_id === competitionId)
                .map((r) => {
                    const u = this.db.users.find((x) => x.id === r.user_id) ?? {};
                    return {
                        ...r,
                        created_at: r.created_at ?? '',
                        display_name: u.display_name,
                        avatar_url: u.avatar_url,
                    };
                })
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return { results: rows };
        }

        if (q.includes('from user_blocks b')) {
            const id = p[0];
            const isBlockerSide = q.includes('where b.blocker_id = ?');
            const rows = this.db.blocks
                .filter((r) => (isBlockerSide ? r.blocker_id === id : r.blocked_id === id))
                .map((r) => {
                    const otherId = isBlockerSide ? r.blocked_id : r.blocker_id;
                    const u = this.db.users.find((x) => x.id === otherId) ?? {};
                    return {
                        ...r,
                        username: u.username,
                        display_name: u.display_name,
                        avatar_url: u.avatar_url
                    };
                });
            return { results: rows };
        }

        // competitions / follows / anything else -> empty list
        if (q.includes('from competitions') || q.includes('from follows')) {
            return { results: [] };
        }

        return { results: [] };
    }

    async raw(): Promise<any[]> {
        const q = norm(this.sql);
        if (q.startsWith('select')) {
            const row = await this.first();
            return row ? [row] : [];
        }
        return [];
    }

    async run(): Promise<{
        success: boolean;
        meta: { last_row_id: number | null; changes: number };
        results?: Row[];
    }> {
        const ok = (meta: { last_row_id: number | null; changes: number }) => ({ success: true, meta });
        const q = norm(this.sql);
        const p = this.params;

        // INSERT INTO users (email, username, display_name, password_hash,
        //  avatar_url, country, language, verification_token,
        //  verification_token_expires, oauth_provider, oauth_id, is_verified, ...)
        if (q.startsWith('insert into users')) {
            const newId = ++this.db.userSeq;
            const row: Row = {
                id: newId,
                email: p[0],
                username: p[1],
                display_name: p[2],
                password_hash: p[3],
                avatar_url: p[4],
                country: p[5],
                language: p[6],
                verification_token: p[7],
                verification_token_expires: p[8],
                oauth_provider: p[9],
                oauth_id: p[10],
                is_verified: p[11] ?? 0,
                is_active: 1,
                total_competitions: 0,
                total_wins: 0,
                total_views: 0,
                created_at: new Date().toISOString()
            };
            this.db.users.push(row);
            return ok({ last_row_id: newId, changes: 1 });
        }

        // INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ...)
        if (q.startsWith('insert into sessions')) {
            this.db.sessions.push({ id: p[0], user_id: p[1], expires_at: p[2] });
            return ok({ last_row_id: null, changes: 1 });
        }

        // Generic UPDATE users SET <cols...> WHERE id = ?
        if (q.startsWith('update users set')) {
            const setPart = q.slice('update users set'.length).split(' where ')[0];
            const cols = [...setPart.matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1]);
            const id = p[p.length - 1];
            const user = this.db.users.find((u) => u.id === id);
            if (!user) return ok({ last_row_id: null, changes: 0 });
            cols.forEach((col, i) => {
                user[col] = p[i];
            });
            return ok({ last_row_id: null, changes: 1 });
        }

        // INSERT INTO competitions (minimal for B5-4)
        if (q.startsWith('insert into competitions')) {
            const newId = p[0] ?? ++this.db.competitionSeq;
            this.db.competitions.push({
                id: newId,
                title: p[1] ?? 'comp',
                creator_id: p[2],
                opponent_id: p[3] ?? null,
                status: p[4] ?? 'pending',
                category_id: p[5] ?? null,
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // B6: INSERT INTO conversations (for startConversation test)
        if (q.startsWith('insert into conversations')) {
            const newId = ++this.db.conversationSeq;
            this.db.conversations.push({
                id: newId,
                user1_id: p[0],
                user2_id: p[1],
                created_at: p[2] ?? new Date().toISOString(),
                last_message_at: null,
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // B6: INSERT INTO messages (for message creation test)
        if (q.startsWith('insert into messages')) {
            const newId = ++this.db.messageSeq;
            this.db.messages.push({
                id: newId,
                conversation_id: p[0],
                sender_id: p[1],
                receiver_id: p[2],
                content: p[3],
                is_read: 0,
                read_at: null,
                created_at: p[5] ?? new Date().toISOString(),
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // B6: UPDATE conversations SET last_message_at = ? WHERE id = ?
        if (q.startsWith('update conversations set last_message_at')) {
            const conv = this.db.conversations.find((c: any) => c.id === p[1]);
            if (conv) {
                conv.last_message_at = p[0];
                return ok({ last_row_id: null, changes: 1 });
            }
            return ok({ last_row_id: null, changes: 0 });
        }

        // UPDATE competitions SET opponent_id = ?, status = 'accepted' WHERE id = ? AND opponent_id IS NULL
        // (setOpponent — atomic guard)
        if (q.startsWith('update competitions set opponent_id') && q.includes('opponent_id is null')) {
            const competition = this.db.competitions.find((c) => c.id === p[1]);
            if (!competition || competition.opponent_id !== null) {
                return ok({ last_row_id: null, changes: 0 });
            }
            competition.opponent_id = p[0];
            competition.status = 'accepted';
            return ok({ last_row_id: null, changes: 1 });
        }

        // INSERT INTO competition_invitations
        if (q.startsWith('insert into competition_invitations')) {
            const newId = ++this.db.invitationSeq;
            this.db.invitations.push({
                id: newId,
                competition_id: p[0],
                inviter_id: p[1],
                invitee_id: p[2],
                message: p[3] ?? null,
                status: 'pending',
                created_at: new Date().toISOString(),
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // UPDATE competition_invitations SET status = 'accepted' WHERE id = ?
        //   [AND EXISTS (SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?)]
        // The EXISTS guard (added for B5-4's race fix) is honored here so the fake DB
        // actually reproduces the real invariant: this statement is a no-op unless the
        // setOpponent step earlier in the same batch actually won the opponent slot for
        // the caller. params with the guard: [invitationId, competitionId, winnerId].
        if (q.startsWith('update competition_invitations set status = \'accepted\'')) {
            const inv = this.db.invitations.find((i) => i.id === p[0]);
            if (!inv) return ok({ last_row_id: null, changes: 0 });
            if (q.includes('exists')) {
                const competition = this.db.competitions.find((c) => c.id === p[1]);
                if (!competition || competition.opponent_id !== p[2]) {
                    return ok({ last_row_id: null, changes: 0 });
                }
            }
            inv.status = 'accepted';
            inv.responded_at = new Date().toISOString();
            return ok({ last_row_id: null, changes: 1 });
        }

        // UPDATE competition_invitations SET status = 'declined' WHERE competition_id = ? AND id != ? AND status = 'pending'
        //   [AND EXISTS (SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?)]
        // Same guard as above — params with the guard: [competitionId, exceptInvitationId, competitionId, winnerId].
        if (q.startsWith('update competition_invitations set status = \'declined\'')) {
            if (q.includes('exists')) {
                const competition = this.db.competitions.find((c) => c.id === p[2]);
                if (!competition || competition.opponent_id !== p[3]) {
                    return ok({ last_row_id: null, changes: 0 });
                }
            }
            this.db.invitations.forEach((i) => {
                if (i.competition_id === p[0] && i.id !== p[1] && i.status === 'pending') {
                    i.status = 'declined';
                }
            });
            const changed = this.db.invitations.filter(
                (i) => i.competition_id === p[0] && i.status === 'declined'
            ).length;
            return ok({ last_row_id: null, changes: changed });
        }

        // UPDATE competition_requests SET status = 'auto_declined' WHERE competition_id = ? AND status = 'pending'
        if (q.startsWith('update competition_requests')) {
            return ok({ last_row_id: null, changes: 0 }); // no-op in fake
        }

        // INSERT INTO notifications
        if (q.startsWith('insert into notifications')) {
            const newId = ++this.db.notificationSeq;
            this.db.notifications.push({
                id: newId,
                user_id: p[0],
                type: p[1],
                title: p[2],
                message: p[3],
                reference_type: p[4],
                reference_id: p[5],
                created_at: new Date().toISOString(),
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // INSERT INTO comments (competition_id, user_id, content, is_live, parent_id, created_at)
        if (q.startsWith('insert into comments')) {
            const newId = ++this.db.commentSeq;
            this.db.comments.push({
                id: newId,
                competition_id: p[0],
                user_id: p[1],
                content: p[2],
                is_live: p[3],
                parent_id: p[4],
                created_at: new Date().toISOString(),
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // B2+B3: soft-delete + SSE log (test fake only)
        if (q.startsWith('update comments set deleted_at')) {
            const row = this.db.comments.find((c) => c.id === p[0] && !c.deleted_at);
            if (!row) return ok({ last_row_id: null, changes: 0 });
            row.deleted_at = new Date().toISOString();
            return ok({ last_row_id: null, changes: 1 });
        }
        if (q.startsWith('insert into sse_event_log')) {
            const newId = ++this.db.sseSeq;
            this.db.sseEvents.push({ id: newId, channel: p[0], event_type: p[1], payload: p[2], created_at: new Date().toISOString() });
            return ok({ last_row_id: newId, changes: 1 });
        }
        if (q.startsWith('select * from sse_event_log where id = ?')) {
            const row = this.db.sseEvents.find((e) => e.id === p[0]) ?? null;
            return { success: true, meta: { last_row_id: null, changes: 0 }, results: row ? [row] : [] };
        }
        if (q.startsWith('select * from sse_event_log where channel = ?')) {
            const rows = this.db.sseEvents
                .filter((e) => e.channel === p[0] && e.id > (p[1] as number))
                .sort((a, b) => a.id - b.id)
                .slice(0, (p[2] as number) || 50);
            return { success: true, meta: { last_row_id: null, changes: 0 }, results: rows };
        }

        // B7: UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?
        if (q.startsWith('update competitions set total_comments')) {
            const comp = this.db.competitions.find((cm) => cm.id === p[0]);
            if (comp) comp.total_comments = (comp.total_comments || 0) + 1;
            return ok({ last_row_id: null, changes: comp ? 1 : 0 });
        }

        // --- B7: INSERT INTO rate_limits ... ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
        if (q.startsWith('insert into rate_limits')) {
            const hit = this.db.rateLimits.find(
                (r) => r.key === p[0] && r.window_start === p[1]
            );
            if (hit) {
                hit.count += 1;
                return ok({ last_row_id: null, changes: 1 });
            }
            this.db.rateLimits.push({ key: p[0], window_start: p[1], count: 1 });
            return ok({ last_row_id: null, changes: 1 });
        }

        // INSERT INTO user_blocks ...
        if (q.startsWith('insert into user_blocks')) {
            const newId = ++this.db.blockSeq;
            this.db.blocks.push({
                id: newId,
                blocker_id: p[0],
                blocked_id: p[1],
                reason: p[2],
                created_at: new Date().toISOString()
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?
        if (q.startsWith('delete from user_blocks')) {
            const before = this.db.blocks.length;
            this.db.blocks = this.db.blocks.filter(
                (r) => !(r.blocker_id === p[0] && r.blocked_id === p[1])
            );
            return ok({ last_row_id: null, changes: before - this.db.blocks.length });
        }

        // Cascade deletes in block() (conversations / invitations / requests) — no-op
        if (q.startsWith('delete from conversations') || q.startsWith('delete from competition_')) {
            return ok({ last_row_id: null, changes: 0 });
        }

        // INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
        if (q.startsWith('insert into ratings')) {
            const newId = ++this.db.ratingSeq;
            this.db.ratings.push({
                id: newId,
                competition_id: p[0],
                user_id: p[1],
                competitor_id: p[2],
                rating: p[3],
                created_at: new Date().toISOString(),
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // INSERT INTO donations (user_id, amount, currency, payment_method,
        //  [payment_status='pending' literal], donor_name, donor_email,
        //  message, is_anonymous, created_at)
        if (q.startsWith('insert into donations')) {
            const newId = ++this.db.donationSeq;
            this.db.donations.push({
                id: newId,
                user_id: p[0],
                amount: p[1],
                currency: p[2],
                payment_method: p[3],
                payment_status: 'pending',
                transaction_id: null,
                donor_name: p[4],
                donor_email: p[5],
                message: p[6],
                is_anonymous: !!p[7],
                created_at: new Date().toISOString()
            });
            return ok({ last_row_id: newId, changes: 1 });
        }

        // Generic UPDATE donations SET <cols...> WHERE id = ?
        if (q.startsWith('update donations set')) {
            const setPart = q.slice('update donations set'.length).split(' where ')[0];
            const cols = [...setPart.matchAll(/(\w+)\s*=\s*\?/g)].map((m) => m[1]);
            const id = p[p.length - 1];
            const donation = this.db.donations.find((d) => d.id === id);
            if (!donation) return ok({ last_row_id: null, changes: 0 });
            cols.forEach((col, i) => {
                donation[col] = p[i];
            });
            return ok({ last_row_id: null, changes: 1 });
        }

        // DELETE FROM sessions ...
        if (q.startsWith('delete from sessions')) {
            return ok({ last_row_id: null, changes: 0 });
        }

        return ok({ last_row_id: null, changes: 0 });
    }
}
