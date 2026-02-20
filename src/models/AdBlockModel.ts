/**
 * @file src/models/AdBlockModel.ts
 * @description نموذج حظر الإعلانات من قبل المتنافسين (FR-016)
 * @module models/AdBlockModel
 * 
 * Each competitor can block specific ads from appearing in their competitions.
 * If either competitor blocks an ad, it won't appear.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Ad Block Interface
 */
export interface AdBlock {
    id: number;
    user_id: number;
    ad_id: number;
    created_at: string;
}

/**
 * Ad Block Model Class
 * نموذج حظر الإعلانات
 */
export class AdBlockModel extends BaseModel<AdBlock> {
    protected readonly tableName = 'ad_blocks';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - block an ad
     */
    async create(data: Partial<AdBlock>): Promise<AdBlock> {
        const result = await this.db.prepare(`
            INSERT OR IGNORE INTO ${this.tableName} (user_id, ad_id, created_at)
            VALUES (?, ?, datetime('now'))
        `).bind(data.user_id, data.ad_id).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to block ad');
    }

    /**
     * Update - not typically used
     */
    async update(id: number, data: Partial<AdBlock>): Promise<AdBlock | null> {
        return this.findById(id);
    }

    /**
     * Block an ad for a user
     */
    async blockAd(userId: number, adId: number): Promise<boolean> {
        try {
            await this.db.prepare(`
                INSERT OR IGNORE INTO ${this.tableName} (user_id, ad_id, created_at)
                VALUES (?, ?, datetime('now'))
            `).bind(userId, adId).run();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Unblock an ad for a user
     */
    async unblockAd(userId: number, adId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            DELETE FROM ${this.tableName} WHERE user_id = ? AND ad_id = ?
        `).bind(userId, adId).run();
        return result.meta.changes > 0;
    }

    /**
     * Check if a user has blocked an ad
     */
    async isBlocked(userId: number, adId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM ${this.tableName} WHERE user_id = ? AND ad_id = ?
        `).bind(userId, adId).first();
        return result !== null;
    }

    /**
     * Get all blocked ad IDs for a user
     */
    async getBlockedAdIds(userId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT ad_id FROM ${this.tableName} WHERE user_id = ?
        `).bind(userId).all();
        return (result.results || []).map((r: any) => r.ad_id);
    }

    /**
     * Get blocked ad IDs for a competition (both competitors)
     * FR-016: If EITHER competitor blocks an ad, it doesn't appear
     */
    async getBlockedAdsForCompetition(creatorId: number, opponentId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT DISTINCT ad_id FROM ${this.tableName} 
            WHERE user_id IN (?, ?)
        `).bind(creatorId, opponentId).all();
        return (result.results || []).map((r: any) => r.ad_id);
    }

    /**
     * Get user's blocked ads with ad details
     */
    async getBlockedAdsWithDetails(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT ab.*, a.title, a.image_url, a.link_url
            FROM ${this.tableName} ab
            JOIN advertisements a ON ab.ad_id = a.id
            WHERE ab.user_id = ?
            ORDER BY ab.created_at DESC
        `).bind(userId).all();
        return result.results || [];
    }
}

export default AdBlockModel;
