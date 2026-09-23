/**
 * RealtimeTicketService — C4 (SEC-11 docs/12-SECURITY-REMEDIATION.md)
 *
 * Single-use, short-lived, channel-bound connection tickets for SSE
 * (EventSource cannot send Authorization headers, so the raw session must
 * never travel in `?token=` — it lands in logs, history and Referer).
 *
 * Ticket: 256-bit opaque hex, TTL 60s, bound to (user_id, channel),
 * consumed atomically (SELECT then DELETE) on first redeem.
 */

export const REALTIME_TICKET_TTL_SECONDS = 60;

function mintToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RealtimeTicketService {
    constructor(private readonly db: D1Database) {}

    async mint(userId: number, channel: string, ttlSeconds = REALTIME_TICKET_TTL_SECONDS): Promise<{ ticket: string; expiresIn: number }> {
        const ticket = mintToken();
        // NOTE: ttl is an internal number — interpolated, never caller input.
        // Expiry is compared in SQL (datetime('now')) on redeem, so no JS/UTC
        // timezone skew can shrink the window (Africa/Cairo builders beware).
        await this.db.prepare(
            `INSERT INTO realtime_tickets (ticket, user_id, channel, expires_at)
             VALUES (?, ?, ?, datetime('now', '+${ttlSeconds} seconds'))`
        ).bind(ticket, userId, channel).run();
        return { ticket, expiresIn: ttlSeconds };
    }

    /**
     * Validate + consume a ticket for the exact channel being opened.
     * Returns the bound user_id, or null (unknown / expired / wrong channel / reused).
     * Expiry is enforced in SQL so JS timezone parsing can never shrink the TTL.
     */
    async redeem(ticket: string, channel: string): Promise<number | null> {
        if (!ticket) return null;
        const row = await this.db.prepare(
            'SELECT user_id, channel FROM realtime_tickets WHERE ticket = ?'
        ).bind(ticket).first<{ user_id: number; channel: string }>();
        if (!row) return null;
        if (row.channel !== channel) return null;
        const consumed = await this.db.prepare(
            "DELETE FROM realtime_tickets WHERE ticket = ? AND expires_at > datetime('now')"
        ).bind(ticket).run();
        if ((consumed.meta.changes ?? 0) === 0) {
            await this.db.prepare('DELETE FROM realtime_tickets WHERE ticket = ?').bind(ticket).run();
            return null;
        }
        // Opportunistic prune — table stays tiny without a cron dependency.
        await this.db.prepare(
            "DELETE FROM realtime_tickets WHERE expires_at < datetime('now')"
        ).run().catch(() => undefined);
        return row.user_id;
    }
}
