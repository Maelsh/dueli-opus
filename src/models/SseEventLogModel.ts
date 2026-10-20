/**
 * @file src/models/SseEventLogModel.ts
 * @description Persisted SSE event log for reconnect support (Task 9)
 *              نموذج سجل أحداث SSE للدعم عند إعادة الاتصال
 * @module models/SseEventLogModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

// =============================================
// Interfaces / Types
// =============================================

export type SseChannel =
    | `competition:${number}`
    | `user:${number}`
    | 'global';

export type SseEventType =
    | 'comment_new'
    | 'comment_deleted'
    | 'invite_sent'
    | 'invite_accepted'
    | 'invite_declined'
    | 'competition_suspended'
    | 'competition_status'
    // R2-V: interim/final rating tally on the existing competition channel.
    | 'rating_updated'
    | 'notification'
    | 'withdrawal_status'
    // 8.E: donation received during a live competition (existing SSE infra,
    // no new realtime system — persisted in the same sse_event_log table).
    | 'donation_new'
    | 'signal_offer'
    | 'signal_answer'
    | 'signal_ice'
    | 'signal_request_offer'
    // 7.B: live session presence (same storage, no new table)
    | 'session_join'
    | 'session_leave';

export interface SseEventLog {
    id: number;
    channel: string;
    event_type: SseEventType;
    payload: string; // JSON string
    created_at: string;
}

// =============================================
// Model
// =============================================

export class SseEventLogModel extends BaseModel<SseEventLog> {
    protected readonly tableName = 'sse_event_log';

    constructor(db: D1Database) {
        super(db);
    }

    /** Required by BaseModel */
    async create(data: Partial<SseEventLog>): Promise<SseEventLog> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (channel, event_type, payload, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).bind(
            data.channel,
            data.event_type,
            data.payload
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to log SSE event');
    }

    /** Required by BaseModel (no update semantics for event log) */
    async update(id: number, _data: Partial<SseEventLog>): Promise<SseEventLog | null> {
        return this.findById(id);
    }

    /**
     * Persist and return a new SSE event.
     * Callers can then push this over the SSE stream.
     */
    async publish(
        channel: string,
        eventType: SseEventType,
        payload: Record<string, unknown>
    ): Promise<SseEventLog> {
        return this.create({
            channel,
            event_type: eventType,
            payload: JSON.stringify(payload)
        });
    }

    /**
     * Get events after a specific ID (for SSE Last-Event-Id reconnect).
     */
    async getAfter(
        channel: string,
        lastId: number,
        limit = 50
    ): Promise<SseEventLog[]> {
        const res = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE channel = ? AND id > ?
            ORDER BY id ASC
            LIMIT ?
        `).bind(channel, lastId, limit).all<SseEventLog>();

        return res.results || [];
    }

    /**
     * FV20-REPLAY: current high-water mark of a channel.
     * A fresh SSE subscription starts here instead of at 0 — the persisted
     * log exists for reconnect catch-up (Last-Event-Id), not for replaying
     * yesterday's notifications as new toasts on every page load.
     * Uses the existing (channel, id) index; no history scan.
     */
    async getLatestId(channel: string): Promise<number> {
        const row = await this.db.prepare(`
            SELECT COALESCE(MAX(id), 0) AS id FROM ${this.tableName}
            WHERE channel = ?
        `).bind(channel).first<{ id: number }>();

        return row && Number.isFinite(Number(row.id)) ? Number(row.id) : 0;
    }

    /**
     * 7.B: read the newest events of a channel (newest first).
     * Used for live session presence/state — same table, no new storage.
     */
    async getRecent(
        channel: string,
        limit = 200
    ): Promise<SseEventLog[]> {
        const res = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE channel = ?
            ORDER BY id DESC
            LIMIT ?
        `).bind(channel, limit).all<SseEventLog>();

        return res.results || [];
    }

    /**
     * Prune old events to prevent unbounded growth (keep last 24h).
     */
    async prune(): Promise<void> {
        await this.db.prepare(`
            DELETE FROM ${this.tableName}
            WHERE created_at < datetime('now', '-24 hours')
        `).run();
    }
}

export default SseEventLogModel;
