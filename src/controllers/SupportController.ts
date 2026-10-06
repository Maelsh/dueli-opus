/**
 * @file src/controllers/SupportController.ts
 * @description R2-M (H6) admin messaging: user support threads (own threads
 * only) + authorized-agent inbox (read/reply/close). Storage is the
 * independent support_* tables — never personal conversations. Official
 * replies render under the Dueli identity (never the agent's personal
 * profile link); the agent id stays in the row + audit log.
 * @module controllers/SupportController
 */

import { BaseController, AppContext } from './base/BaseController';
import { SupportModel, SupportThread, SupportMessage, SupportThreadStatus } from '../models/SupportModel';
import { AdminRoleModel } from '../models/AdminRoleModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';
import { NotificationModel } from '../models/NotificationModel';
import { UserModel } from '../models/UserModel';
import { RateLimitService } from '../lib/services/RateLimitService';
import { Sanitize } from '../lib/services/Sanitize';
import { ContentTooLongError, ValidationError } from '../lib/errors/AppError';

function safeThread(row: SupportThread | null) {
    if (!row) return null;
    const { ...rest } = row;
    return rest;
}

function safeMessage(row: SupportMessage | null) {
    if (!row) return null;
    // sender_id is intentionally kept: it is the audit actor for admin
    // readers; clients render the official label for admin-kind rows and
    // never link them to a personal profile.
    return {
        id: row.id,
        thread_id: row.thread_id,
        sender_kind: row.sender_kind,
        content: row.content,
        created_at: row.created_at,
    };
}

export class SupportController extends BaseController {

    // ---------- shared gates ----------

    /** Inbox reader: every admin-flag holder (Auditor included, read-only). */
    private async requireSupportReader(c: AppContext): Promise<any | null> {
        const user = this.getCurrentUser(c);
        if (!user || user.is_admin !== 1) return null;
        return user;
    }

    /** Inbox writer: SuperAdmin or Moderator only (Auditor is read-only). */
    private async requireSupportWriter(c: AppContext): Promise<any | null> {
        const user = await this.requireSupportReader(c);
        if (!user) return null;
        const has = await new AdminRoleModel(c.env.DB).hasRole(user.id, 'SuperAdmin', 'Moderator');
        return has ? user : null;
    }

    private async consumeMessageQuota(c: AppContext, userId: number): Promise<boolean> {
        // Same abuse class as personal messaging: 20/minute (shared counter).
        const r = await new RateLimitService(c.env.DB).consume(userId, 'message');
        if (!r.allowed) {
            c.header('Retry-After', String(r.retryAfter));
            return false;
        }
        return true;
    }

    // ---------- user side ----------

    /**
     * List own support threads (with per-thread unread of official replies).
     * GET /api/support/threads
     */
    async listThreads(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const limit = Math.max(1, Math.min(this.getQueryInt(c, 'limit') || 20, 50));
            const offset = Math.max(0, this.getQueryInt(c, 'offset') || 0);
            const threads = await new SupportModel(c.env.DB).getUserThreadsWithMeta(user.id, limit, offset);
            return this.success(c, { threads: threads.map(safeThread) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Open a support thread (first message included).
     * POST /api/support/threads { subject?, content }
     */
    async createThread(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const body = await this.getBody<{ subject?: string; content: string }>(c);
            if (!body?.content || !body.content.trim()) {
                return this.validationError(c, this.t('message.content_required', c));
            }
            if (!(await this.consumeMessageQuota(c, user.id))) {
                return this.error(c, this.t('errors.rate_limited', c), 429);
            }
            const model = new SupportModel(c.env.DB);
            const { thread, message } = await model.createThread(
                user.id, body.subject || '', Sanitize.cleanText(body.content)
            );
            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    user.id, 'support_thread_created', 'support_thread', thread.id, 'User opened a support thread'
                );
            } catch (e) { console.error('[SupportController] audit failed:', e); }
            return this.success(c, { thread: safeThread(thread), message: safeMessage(message) }, 201);
        } catch (error) {
            if (error instanceof ContentTooLongError) {
                return this.error(c, this.t('errors.content_too_long', c), 400);
            }
            if (error instanceof ValidationError) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Read own thread (marks official replies read).
     * GET /api/support/threads/:id
     */
    async getThread(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const model = new SupportModel(c.env.DB);
            const thread = await model.findThread(id);
            if (!thread || thread.user_id !== user.id) return this.forbidden(c);
            await model.markRead(id, 'user');
            const messages = await model.getMessages(id);
            return this.success(c, { thread: safeThread(thread), messages: messages.map(safeMessage) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Reply in own open thread.
     * POST /api/support/threads/:id/messages { content }
     */
    async postMessage(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const body = await this.getBody<{ content: string }>(c);
            if (!body?.content || !body.content.trim()) {
                return this.validationError(c, this.t('message.content_required', c));
            }
            if (!(await this.consumeMessageQuota(c, user.id))) {
                return this.error(c, this.t('errors.rate_limited', c), 429);
            }
            const model = new SupportModel(c.env.DB);
            const thread = await model.findThread(id);
            if (!thread || thread.user_id !== user.id) return this.forbidden(c);
            if (thread.status !== 'open') {
                return this.error(c, this.t('support.thread_closed', c), 409);
            }
            const message = await model.postMessage(id, 'user', user.id, Sanitize.cleanText(body.content));
            return this.success(c, { message: safeMessage(message) }, 201);
        } catch (error) {
            if (error instanceof ContentTooLongError) {
                return this.error(c, this.t('errors.content_too_long', c), 400);
            }
            if (error instanceof ValidationError) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Own unread official replies.
     * GET /api/support/unread
     */
    async getUnread(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const unread = await new SupportModel(c.env.DB).countUnreadForUser(user.id);
            return this.success(c, { unread });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    // ---------- admin side ----------

    /**
     * Admin inbox: all threads (reader role and up).
     * GET /api/admin/support/threads?status=
     */
    async adminList(c: AppContext) {
        try {
            if (!await this.requireSupportReader(c)) return this.forbidden(c);
            const statusRaw = this.getQuery(c, 'status');
            const status: SupportThreadStatus | null =
                statusRaw === 'open' || statusRaw === 'closed' ? statusRaw : null;
            if (statusRaw && !status) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            const limit = Math.max(1, Math.min(this.getQueryInt(c, 'limit') || 20, 50));
            const offset = Math.max(0, this.getQueryInt(c, 'offset') || 0);
            const threads = await new SupportModel(c.env.DB).listThreadsForAdmin(status, limit, offset);
            return this.success(c, { threads: threads.map(safeThread) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: read any thread (marks user messages read).
     * GET /api/admin/support/threads/:id
     */
    async adminGet(c: AppContext) {
        try {
            if (!await this.requireSupportReader(c)) return this.forbidden(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const model = new SupportModel(c.env.DB);
            const thread = await model.findThread(id);
            if (!thread) return this.notFound(c);
            await model.markRead(id, 'admin');
            const messages = await model.getMessages(id);
            const owner = await new UserModel(c.env.DB).findById(thread.user_id);
            return this.success(c, {
                thread: {
                    ...safeThread(thread),
                    username: owner?.username ?? null,
                    display_name: owner?.display_name ?? owner?.username ?? null,
                },
                messages: messages.map(safeMessage),
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: official reply (SuperAdmin/Moderator; Auditor is read-only).
     * POST /api/admin/support/threads/:id/reply { content }
     */
    async adminReply(c: AppContext) {
        try {
            const agent = await this.requireSupportWriter(c);
            if (!agent) return this.forbidden(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const body = await this.getBody<{ content: string }>(c);
            if (!body?.content || !body.content.trim()) {
                return this.validationError(c, this.t('message.content_required', c));
            }
            if (!(await this.consumeMessageQuota(c, agent.id))) {
                return this.error(c, this.t('errors.rate_limited', c), 429);
            }
            const model = new SupportModel(c.env.DB);
            const thread = await model.findThread(id);
            if (!thread) return this.notFound(c);
            if (thread.status !== 'open') {
                return this.error(c, this.t('support.thread_closed', c), 409);
            }
            const message = await model.postMessage(id, 'admin', agent.id, Sanitize.cleanText(body.content));
            // Official-identity notification to the thread owner (distinct
            // type + support_thread reference — never mixed with personal
            // message notifications).
            try {
                await new NotificationModel(c.env.DB).createForType({
                    user_id: thread.user_id,
                    type: 'admin_message',
                    payload: { preview: body.content.substring(0, 100) },
                    reference_type: 'support_thread',
                    reference_id: id,
                });
            } catch (e) { console.error('[SupportController] notify failed:', e); }
            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    agent.id, 'support_replied', 'support_thread', id, 'Official reply posted'
                );
            } catch (e) { console.error('[SupportController] audit failed:', e); }
            return this.success(c, { message: safeMessage(message) }, 201);
        } catch (error) {
            if (error instanceof ContentTooLongError) {
                return this.error(c, this.t('errors.content_too_long', c), 400);
            }
            if (error instanceof ValidationError) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin: open/close a thread (writer role).
     * PUT /api/admin/support/threads/:id/status { status }
     */
    async adminSetStatus(c: AppContext) {
        try {
            const agent = await this.requireSupportWriter(c);
            if (!agent) return this.forbidden(c);
            const id = this.getParamInt(c, 'id');
            if (!id) return this.validationError(c, this.t('errors.invalid_id', c));
            const body = await this.getBody<{ status: SupportThreadStatus }>(c);
            if (body?.status !== 'open' && body?.status !== 'closed') {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            const model = new SupportModel(c.env.DB);
            const thread = await model.findThread(id);
            if (!thread) return this.notFound(c);
            const updated = await model.setStatus(id, body.status);
            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    agent.id, body.status === 'closed' ? 'support_closed' : 'support_reopened',
                    'support_thread', id, `status=${body.status}`
                );
            } catch (e) { console.error('[SupportController] audit failed:', e); }
            return this.success(c, { thread: safeThread(updated) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Admin inbox badge: unread user messages.
     * GET /api/admin/support/unread
     */
    async adminUnread(c: AppContext) {
        try {
            if (!await this.requireSupportReader(c)) return this.forbidden(c);
            const unread = await new SupportModel(c.env.DB).countUnreadForAdmin();
            return this.success(c, { unread });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default SupportController;
