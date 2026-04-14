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
    | 'notification'
    | 'withdrawal_status';

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
