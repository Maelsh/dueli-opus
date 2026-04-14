import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export interface PlatformSetting {
    id: number;
    setting_key: string;
    setting_value: string;
    description: string | null;
    updated_by: number | null;
    updated_at: string;
}

export class PlatformSettingsModel extends BaseModel<PlatformSetting> {
    protected readonly tableName = 'platform_settings';

    constructor(db: D1Database) {
        super(db);
    }

    async create(data: Partial<PlatformSetting>): Promise<PlatformSetting> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (setting_key, setting_value, description, updated_by, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(
            data.setting_key,
            data.setting_value,
            data.description || null,
            data.updated_by || null
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create platform setting');
    }

    async update(id: number, data: Partial<PlatformSetting>): Promise<PlatformSetting | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.setting_value !== undefined) {
            updates.push('setting_value = ?');
            values.push(data.setting_value);
        }
        if (data.description !== undefined) {
            updates.push('description = ?');
            values.push(data.description);
        }
        if (data.updated_by !== undefined) {
            updates.push('updated_by = ?');
            values.push(data.updated_by);
        }

        if (updates.length === 0) return this.findById(id);

        updates.push("updated_at = datetime('now')");
        values.push(id);

        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    async getByKey(key: string): Promise<string | null> {
        const result = await this.db.prepare(
            `SELECT setting_value FROM ${this.tableName} WHERE setting_key = ?`
        ).bind(key).first<{ setting_value: string }>();
        return result?.setting_value ?? null;
    }

    async getNumeric(key: string): Promise<number> {
        const val = await this.getByKey(key);
        return val !== null ? parseFloat(val) : 0;
    }

    async setByKey(key: string, value: string, updatedBy?: number): Promise<PlatformSetting | null> {
        const existing = await this.db.prepare(
            `SELECT id FROM ${this.tableName} WHERE setting_key = ?`
        ).bind(key).first<{ id: number }>();

        if (existing) {
            return this.update(existing.id, { setting_value: value, updated_by: updatedBy || null });
        } else {
            return this.create({ setting_key: key, setting_value: value, updated_by: updatedBy || null });
        }
    }

    async getPlatformSharePercentage(): Promise<number> {
        return this.getNumeric('platform_share_percentage');
    }

    async getAllSettings(): Promise<PlatformSetting[]> {
        const result = await this.db.prepare(
            `SELECT * FROM ${this.tableName} ORDER BY setting_key`
        ).all<PlatformSetting>();
        return result.results || [];
    }
}

export default PlatformSettingsModel;
