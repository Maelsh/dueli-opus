/**
 * @file src/models/ReportModel.ts
 * @description نموذج البلاغات
 * @module models/ReportModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Report target types
 */
export type ReportTargetType = 'user' | 'competition' | 'comment' | 'advertisement';

/**
 * Report status
 */
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

/**
 * Report Interface
 */
export interface Report {
    id: number;
    reporter_id: number;
    target_type: ReportTargetType;
    target_id: number;
    reason: string;
    description: string | null;
    status: ReportStatus;
    reviewed_by: number | null;
    reviewed_at: string | null;
    action_taken: string | null;
    created_at: string;
}

/**
 * Report with details
 */
export interface ReportWithDetails extends Report {
    reporter_username: string;
    reporter_display_name: string;
    reviewer_username?: string;
    target_info?: any;
}

/**
 * Create Report Data
 */
export interface CreateReportData {
    reporter_id: number;
    target_type: ReportTargetType;
    target_id: number;
    reason: string;
    description?: string;
}

/**
 * Report Reasons (predefined)
 */
export const REPORT_REASONS = {
    user: ['spam', 'harassment', 'fake_account', 'inappropriate_content', 'other'],
    competition: ['spam', 'misleading', 'inappropriate_content', 'copyright', 'other'],
    comment: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'other'],
    advertisement: ['inappropriate_content', 'misleading', 'offensive', 'spam', 'other']
} as const;

/**
 * Report Model Class
 * نموذج البلاغات
 */
export class ReportModel extends BaseModel<Report> {
    protected readonly tableName = 'reports';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Report>): Promise<Report> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (reporter_id, target_type, target_id, reason, description, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
            data.reporter_id,
            data.target_type,
            data.target_id,
            data.reason,
            data.description || null,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create report');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Report>): Promise<Report | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.status !== undefined) {
            updates.push('status = ?');
            values.push(data.status);
        }
        if (data.reviewed_by !== undefined) {
            updates.push('reviewed_by = ?');
            values.push(data.reviewed_by);
        }
        if (data.reviewed_at !== undefined) {
            updates.push('reviewed_at = ?');
            values.push(data.reviewed_at);
        }
        if (data.action_taken !== undefined) {
            updates.push('action_taken = ?');
            values.push(data.action_taken);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Check if user has already reported this target
     */
    async hasReported(reporterId: number, targetType: ReportTargetType, targetId: number): Promise<boolean> {
        const result = await this.db.prepare(
            `SELECT id FROM ${this.tableName} WHERE reporter_id = ? AND target_type = ? AND target_id = ?`
        ).bind(reporterId, targetType, targetId).first();
        return !!result;
    }

    /**
     * Create a new report
     */
    async createReport(data: CreateReportData): Promise<Report | null> {
        // Check for duplicate report
        if (await this.hasReported(data.reporter_id, data.target_type, data.target_id)) {
            return null;
        }

        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (reporter_id, target_type, target_id, reason, description, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
            data.reporter_id,
            data.target_type,
            data.target_id,
            data.reason,
            data.description || null,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return this.findById(result.meta.last_row_id);
        }
        return null;
    }

    /**
     * Get pending reports (for admin)
     */
    async getPendingReports(limit: number = 50, offset: number = 0): Promise<ReportWithDetails[]> {
        const result = await this.db.prepare(`
            SELECT r.*, 
                   u.username as reporter_username, 
                   u.display_name as reporter_display_name
            FROM ${this.tableName} r
            JOIN users u ON r.reporter_id = u.id
            WHERE r.status = 'pending'
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all<ReportWithDetails>();
        return result.results || [];
    }

    /**
     * Get all reports with filters (for admin)
     */
    async getReports(filters: {
        status?: ReportStatus;
        target_type?: ReportTargetType;
        limit?: number;
        offset?: number;
    } = {}): Promise<ReportWithDetails[]> {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.status) {
            conditions.push('r.status = ?');
            params.push(filters.status);
        }

        if (filters.target_type) {
            conditions.push('r.target_type = ?');
            params.push(filters.target_type);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;

        const result = await this.db.prepare(`
            SELECT r.*, 
                   u.username as reporter_username, 
                   u.display_name as reporter_display_name,
                   rv.username as reviewer_username
            FROM ${this.tableName} r
            JOIN users u ON r.reporter_id = u.id
            LEFT JOIN users rv ON r.reviewed_by = rv.id
            ${whereClause}
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(...params, limit, offset).all<ReportWithDetails>();
        return result.results || [];
    }

    /**
     * Get report count by status
     */
    async getCountByStatus(): Promise<Record<ReportStatus, number>> {
        const result = await this.db.prepare(`
            SELECT status, COUNT(*) as count 
            FROM ${this.tableName} 
            GROUP BY status
        `).all<{ status: ReportStatus; count: number }>();

        const counts: Record<ReportStatus, number> = {
            pending: 0,
            reviewed: 0,
            resolved: 0,
            dismissed: 0
        };

        for (const row of result.results || []) {
            counts[row.status] = row.count;
        }

        return counts;
    }

    /**
     * Review a report (admin action)
     */
    async reviewReport(
        reportId: number,
        reviewerId: number,
        status: ReportStatus,
        actionTaken?: string
    ): Promise<boolean> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            UPDATE ${this.tableName}
            SET status = ?, reviewed_by = ?, reviewed_at = ?, action_taken = ?
            WHERE id = ?
        `).bind(status, reviewerId, now, actionTaken || null, reportId).run();
        return result.success && (result.meta.changes ?? 0) > 0;
    }

    /**
     * Get reports for a specific target
     */
    async getReportsForTarget(targetType: ReportTargetType, targetId: number): Promise<Report[]> {
        const result = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE target_type = ? AND target_id = ?
            ORDER BY created_at DESC
        `).bind(targetType, targetId).all<Report>();
        return result.results || [];
    }

    /**
     * Get report count for target
     */
    async getReportCount(targetType: ReportTargetType, targetId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COUNT(*) as count FROM ${this.tableName}
            WHERE target_type = ? AND target_id = ?
        `).bind(targetType, targetId).first<{ count: number }>();
        return result?.count || 0;
    }
}

export default ReportModel;
