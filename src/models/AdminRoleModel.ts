import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export type AdminRoleType = 'SuperAdmin' | 'Auditor' | 'Moderator';

export interface AdminRole {
    id: number;
    user_id: number;
    role: AdminRoleType;
    granted_by: number | null;
    granted_at: string;
}

export class AdminRoleModel extends BaseModel<AdminRole> {
    protected readonly tableName = 'admin_roles';

    constructor(db: D1Database) {
        super(db);
    }

    async create(data: Partial<AdminRole>): Promise<AdminRole> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (user_id, role, granted_by)
            VALUES (?, ?, ?)
        `).bind(data.user_id, data.role || 'Moderator', data.granted_by || null).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create admin role');
    }

    async update(id: number, data: Partial<AdminRole>): Promise<AdminRole | null> {
        if (data.role !== undefined) {
            await this.db.prepare(
                `UPDATE ${this.tableName} SET role = ? WHERE id = ?`
            ).bind(data.role, id).run();
        }
        return this.findById(id);
    }

    async findByUserId(userId: number): Promise<AdminRole | null> {
        return this.findOne('user_id', userId);
    }

    async getAdminsWithRoles(limit: number = 50, offset: number = 0): Promise<(AdminRole & { username: string; display_name: string })[]> {
        const result = await this.db.prepare(`
            SELECT ar.*, u.username, u.display_name
            FROM ${this.tableName} ar
            JOIN users u ON ar.user_id = u.id
            ORDER BY ar.granted_at DESC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all<AdminRole & { username: string; display_name: string }>();
        return result.results || [];
    }

    async hasRole(userId: number, ...roles: AdminRoleType[]): Promise<boolean> {
        const result = await this.db.prepare(
            `SELECT 1 FROM ${this.tableName} WHERE user_id = ? AND role IN (${roles.map(() => '?').join(',')})`
        ).bind(userId, ...roles).first();
        return result !== null;
    }

    async isSuperAdmin(userId: number): Promise<boolean> {
        return this.hasRole(userId, 'SuperAdmin');
    }

    async deleteByUserId(userId: number): Promise<boolean> {
        const result = await this.db.prepare(
            `DELETE FROM ${this.tableName} WHERE user_id = ?`
        ).bind(userId).run();
        return result.meta.changes > 0;
    }
}

export default AdminRoleModel;
