/**
 * Minimal in-memory D1 fake for unit tests.
 * Implements only the query shapes used by UserModel / UserBlockModel /
 * SessionModel / AuthController / profilePage / CompetitionModel.findByUser.
 */

type Row = Record<string, any>;

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

export class FakeD1 {
    users: Row[] = [];
    blocks: Row[] = [];
    sessions: Row[] = [];
    donations: Row[] = [];
    competitions: Row[] = [];
    requests: Row[] = [];
ratings: Row[] = [];
    userSeq = 0;
    blockSeq = 0;
    donationSeq = 0;
    competitionSeq = 0;
ratingSeq = 0;

    prepare(sql: string): FakeStmt {
        return new FakeStmt(this, sql);
    }
}

class FakeStmt {
    private params: any[] = [];

    constructor(
        private db: FakeD1,
        private sql: string
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
            return ok({ last_row_id: this.db.sessions.length, changes: 1 });
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
            return this.db.competitions.find((r) => r.id === p[0]) ?? null;
        }

// --- ratings ---
        if (q.startsWith('select 1 from ratings')) {
            const hit = this.db.ratings.find(
                (r) => r.competition_id === p[0] && r.user_id === p[1] && r.competitor_id === p[2]
            );
            return hit ? { '1': 1 } : null;
        }

        // --- sessions (create/find for auth in B5-2 error-path tests) ---
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

        // --- ratings with user details (JOIN) ---
        if (q.includes('from ratings r') && q.includes('join users u')) {
            const competitionId = p[0];
            const rows = this.db.ratings
                .filter((r) => r.competition_id === competitionId)
                .map((r) => {
                    const u = this.db.users.find((x) => x.id === r.user_id) ?? {};
                    return {
                        ...r,
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

    async run(): Promise<{
        success: boolean;
        meta: { last_row_id: number | null; changes: number };
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
