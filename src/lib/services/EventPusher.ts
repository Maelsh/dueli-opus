/**
 * @file src/lib/services/EventPusher.ts
 * @description Central SSE / real-time event pusher for Dueli (Task 9)
 *
 * Architecture:
 *   – Cloudflare Workers have no shared memory across requests.
 *   – We use Server-Sent Events (SSE) via ReadableStream per-connection.
 *   – Events are ALSO persisted to `sse_event_log` so disconnected clients
 *     can catch up via the `Last-Event-Id` header upon reconnect.
 *
 * Usage:
 *   1. GET /api/sse?channel=competition:42  → long-lived SSE stream
 *   2. POST events via EventPusher.publish() from any controller
 *
 * نقطة الدفع المركزية للأحداث الفورية
 */

import { D1Database } from '@cloudflare/workers-types';
import { SseEventLogModel, SseEventType } from '../../models/SseEventLogModel';

// =============================================
// EventPusher Service
// =============================================

export class EventPusher {
    private readonly eventLog: SseEventLogModel;

    constructor(private readonly db: D1Database) {
        this.eventLog = new SseEventLogModel(db);
    }

    // ----------------------------------------------------------
    // Core publish – store event + return formatted SSE string
    // ----------------------------------------------------------

    /**
     * Persist an event to D1 and format it as an SSE message string.
     * Controllers call this, then inject into an active SSE stream.
     */
    async publish(
        channel: string,
        eventType: SseEventType,
        payload: Record<string, unknown>
    ): Promise<{ id: number; sseMessage: string }> {
        const log = await this.eventLog.publish(channel, eventType, payload);

        return {
            id: log.id,
            sseMessage: EventPusher.formatSseMessage(log.id, eventType, payload)
        };
    }

    // ----------------------------------------------------------
    // Reconnect support
    // ----------------------------------------------------------

    /**
     * Generate SSE catch-up messages for a reconnecting client.
     * The client sends `Last-Event-Id` header; we replay missed events.
     */
    async getCatchUp(
        channel: string,
        lastEventId: number
    ): Promise<string> {
        const events = await this.eventLog.getAfter(channel, lastEventId);
        return events
            .map(e => EventPusher.formatSseMessage(e.id, e.event_type as SseEventType, JSON.parse(e.payload)))
            .join('');
    }

    // ----------------------------------------------------------
    // Static helpers
    // ----------------------------------------------------------

    /**
     * Format a single SSE message according to the SSE spec.
     *
     * Format:
     *   id: <number>
     *   event: <type>
     *   data: <json>
     *   (blank line)
     */
    static formatSseMessage(
        id: number,
        eventType: string,
        payload: Record<string, unknown>
    ): string {
        return `id: ${id}\nevent: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    }

    /** SSE keep-alive ping */
    static heartbeat(): string {
        return `: heartbeat\n\n`;
    }

    // ----------------------------------------------------------
    // Convenience factory methods (semantic helpers for controllers)
    // ----------------------------------------------------------

    async publishComment(
        competitionId: number,
        comment: { id: number; user_id: number; username: string; avatar_url: string | null; content: string; created_at: string }
    ) {
        return this.publish(`competition:${competitionId}`, 'comment_new', { competition_id: competitionId, comment });
    }

    async publishInvite(
        inviteeId: number,
        invite: { competition_id: number; inviter_username: string; message?: string }
    ) {
        return this.publish(`user:${inviteeId}`, 'invite_sent', { ...invite });
    }

    async publishInviteResponse(
        inviterId: number,
        response: { competition_id: number; invitee_username: string; accepted: boolean }
    ) {
        const type: SseEventType = response.accepted ? 'invite_accepted' : 'invite_declined';
        return this.publish(`user:${inviterId}`, type, { ...response });
    }

    async publishCompetitionSuspended(
        competitionId: number,
        adminName: string,
        reason: string
    ) {
        // Broadcast to both the competition channel AND global admin channel
        await this.publish('global', 'competition_suspended', {
            competition_id: competitionId,
            admin: adminName,
            reason,
            timestamp: new Date().toISOString()
        });
        return this.publish(
            `competition:${competitionId}`,
            'competition_suspended',
            { competition_id: competitionId, reason, timestamp: new Date().toISOString() }
        );
    }

    async publishNotification(
        userId: number,
        notification: { title: string; message: string; type: string; reference_id?: number }
    ) {
        return this.publish(`user:${userId}`, 'notification', { ...notification });
    }

    async publishWithdrawalStatus(
        userId: number,
        requestId: number,
        status: string,
        note?: string
    ) {
        return this.publish(`user:${userId}`, 'withdrawal_status', {
            request_id: requestId,
            status,
            note: note || null
        });
    }
}

export default EventPusher;
