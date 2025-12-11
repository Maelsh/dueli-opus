/**
 * @file src/models/AdvertisementModel.ts
 * @description نموذج الإعلانات والأرباح
 * @module models/AdvertisementModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Advertisement Interface
 */
export interface Advertisement {
    id: number;
    title: string;
    image_url: string | null;
    link_url: string | null;
    is_active: number;
    views_count: number;
    clicks_count: number;
    revenue_per_view: number;
    created_by: number;
    created_at: string;
}

/**
 * Ad Impression Interface
 */
export interface AdImpression {
    id: number;
    ad_id: number;
    competition_id: number;
    user_id: number | null;
    created_at: string;
}

/**
 * User Earnings Interface
 */
export interface UserEarnings {
    id: number;
    user_id: number;
    competition_id: number;
    amount: number;
    status: 'pending' | 'paid';
    created_at: string;
}

/**
 * Advertisement Model Class
 * نموذج الإعلانات
 */
export class AdvertisementModel extends BaseModel<Advertisement> {
    protected readonly tableName = 'advertisements';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Advertisement>): Promise<Advertisement> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (title, image_url, link_url, is_active, revenue_per_view, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.title,
            data.image_url || null,
            data.link_url || null,
            data.is_active ?? 1,
            data.revenue_per_view || 0.001,
            data.created_by,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create advertisement');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Advertisement>): Promise<Advertisement | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.title !== undefined) {
            updates.push('title = ?');
            values.push(data.title);
        }
        if (data.image_url !== undefined) {
            updates.push('image_url = ?');
            values.push(data.image_url);
        }
        if (data.link_url !== undefined) {
            updates.push('link_url = ?');
            values.push(data.link_url);
        }
        if (data.is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(data.is_active);
        }
        if (data.revenue_per_view !== undefined) {
            updates.push('revenue_per_view = ?');
            values.push(data.revenue_per_view);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Get active ads
     */
    async getActiveAds(limit: number = 5): Promise<Advertisement[]> {
        const result = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE is_active = 1
            ORDER BY RANDOM()
            LIMIT ?
        `).bind(limit).all<Advertisement>();
        return result.results || [];
    }

    /**
     * Record ad impression
     */
    async recordImpression(adId: number, competitionId: number, userId: number | null): Promise<void> {
        const now = new Date().toISOString();
        await this.db.prepare(`
            INSERT INTO ad_impressions (ad_id, competition_id, user_id, created_at)
            VALUES (?, ?, ?, ?)
        `).bind(adId, competitionId, userId, now).run();

        // Increment views count
        await this.db.prepare(`
            UPDATE ${this.tableName} SET views_count = views_count + 1 WHERE id = ?
        `).bind(adId).run();
    }

    /**
     * Record ad click
     */
    async recordClick(adId: number): Promise<void> {
        await this.db.prepare(`
            UPDATE ${this.tableName} SET clicks_count = clicks_count + 1 WHERE id = ?
        `).bind(adId).run();
    }

    /**
     * Get total revenue for a competition
     */
    async getCompetitionRevenue(competitionId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT SUM(a.revenue_per_view) as total
            FROM ad_impressions i
            JOIN ${this.tableName} a ON i.ad_id = a.id
            WHERE i.competition_id = ?
        `).bind(competitionId).first<{ total: number | null }>();
        return result?.total || 0;
    }
}

/**
 * Earnings Model Class
 * نموذج الأرباح
 */
export class EarningsModel extends BaseModel<UserEarnings> {
    protected readonly tableName = 'user_earnings';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<UserEarnings>): Promise<UserEarnings> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (user_id, competition_id, amount, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
        `).bind(data.user_id, data.competition_id, data.amount, now).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create earnings');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<UserEarnings>): Promise<UserEarnings | null> {
        if (data.status !== undefined) {
            await this.db.prepare(`
                UPDATE ${this.tableName} SET status = ? WHERE id = ?
            `).bind(data.status, id).run();
        }
        return this.findById(id);
    }

    /**
     * Get user's total earnings
     */
    async getUserTotalEarnings(userId: number): Promise<{ pending: number; paid: number; total: number }> {
        const result = await this.db.prepare(`
            SELECT 
                SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid,
                SUM(amount) as total
            FROM ${this.tableName}
            WHERE user_id = ?
        `).bind(userId).first<{ pending: number; paid: number; total: number }>();
        return result || { pending: 0, paid: 0, total: 0 };
    }

    /**
     * Get user's earnings history
     */
    async getUserEarnings(userId: number, limit: number = 20, offset: number = 0): Promise<UserEarnings[]> {
        const result = await this.db.prepare(`
            SELECT e.*, c.title as competition_title
            FROM ${this.tableName} e
            LEFT JOIN competitions c ON e.competition_id = c.id
            WHERE e.user_id = ?
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<UserEarnings>();
        return result.results || [];
    }

    /**
     * Calculate and distribute earnings for a competition
     * 80% to competitors (based on rating ratio), 20% to platform
     */
    async calculateAndDistribute(
        competitionId: number,
        creatorId: number,
        opponentId: number,
        creatorRating: number,
        opponentRating: number,
        totalRevenue: number
    ): Promise<void> {
        const competitorShare = totalRevenue * 0.8; // 80% to competitors
        const totalRating = creatorRating + opponentRating;

        if (totalRating === 0) {
            // Equal split if no ratings
            const half = competitorShare / 2;
            await this.create({ user_id: creatorId, competition_id: competitionId, amount: half });
            await this.create({ user_id: opponentId, competition_id: competitionId, amount: half });
        } else {
            // Split based on rating ratio
            const creatorShare = competitorShare * (creatorRating / totalRating);
            const opponentShare = competitorShare * (opponentRating / totalRating);
            await this.create({ user_id: creatorId, competition_id: competitionId, amount: creatorShare });
            await this.create({ user_id: opponentId, competition_id: competitionId, amount: opponentShare });
        }
    }
}

export default AdvertisementModel;
