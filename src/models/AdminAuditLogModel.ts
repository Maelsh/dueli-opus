import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export interface AdminAuditLog {
    id: number;
    admin_id: number;
    action_type: string;
    target_entity: string;
    target_id: number | null;
    details: string | null;
    timestamp: string;
}

export interface AdminAuditLogWithAdmin extends AdminAuditLog {
    admin_username: string;
    admin_display_name: string;
    admin_role: string | null;
}

export class AdminAuditLogModel extends BaseModel<AdminAuditLog> {
    protected readonly tableName = 'admin_audit_logs';

    constructor(db: D1Database) {
        super(db);
    }

    async create(data: Partial<AdminAuditLog>): Promise<AdminAuditLog> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (admin_id, action_type, target_entity, target_id, details, timestamp)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            data.admin_id,
            data.action_type,
            data.target_entity,
            data.target_id || null,
            data.details || null
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create audit log');
    }

    async update(id: number, data: Partial<AdminAuditLog>): Promise<AdminAuditLog | null> {
        return this.findById(id);
    }

    async log(adminId: number, actionType: string, targetEntity: string, targetId: number | null = null, details: string | null = null): Promise<AdminAuditLog> {
        return this.create({
            admin_id: adminId,
            action_type: actionType,
            target_entity: targetEntity,
            target_id: targetId,
            details
        });
    }

    async getLogs(filters: {
        admin_id?: number;
        action_type?: string;
        target_entity?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<AdminAuditLogWithAdmin[]> {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.admin_id) {
            conditions.push('l.admin_id = ?');
            params.push(filters.admin_id);
        }
        if (filters.action_type) {
            conditions.push('l.action_type = ?');
            params.push(filters.action_type);
        }
        if (filters.target_entity) {
            conditions.push('l.target_entity = ?');
            params.push(filters.target_entity);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;

        const result = await this.db.prepare(`
            SELECT l.*, u.username as admin_username, u.display_name as admin_display_name, ar.role as admin_role
            FROM ${this.tableName} l
            JOIN users u ON l.admin_id = u.id
            LEFT JOIN admin_roles ar ON l.admin_id = ar.user_id
            ${whereClause}
            ORDER BY l.timestamp DESC
            LIMIT ? OFFSET ?
        `).bind(...params, limit, offset).all<AdminAuditLogWithAdmin>();

        return result.results || [];
    }

    async getRecentActivity(limit: number = 20): Promise<AdminAuditLogWithAdmin[]> {
        return this.getLogs({ limit });
    }

    async getAdminActionCount(adminId: number): Promise<number> {
        return this.countBy('admin_id', adminId);
    }
}

export default AdminAuditLogModel;
