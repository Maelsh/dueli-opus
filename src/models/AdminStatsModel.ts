/**
 * Admin Stats Model
 * نموذج إحصائيات الإدارة (F-5D)
 *
 * Owns every aggregate/statistics query used by the admin dashboard,
 * extracted from AdminController so the HTTP layer stays SQL-free.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export interface StatusCountRow {
    status: string;
    count: number;
}

export interface CountryDemographicsRow {
    country: string | null;
    count: number;
}

export interface HotCompetitionRow {
    id: number;
    title: string;
    status: string;
    total_views: number;
    creator_rating: number | null;
    opponent_rating: number | null;
    creator_name: string | null;
    opponent_name: string | null;
}

/**
 * Admin Stats Model Class
 */
export class AdminStatsModel extends BaseModel<any> {
    protected readonly tableName = 'users';

    constructor(db: D1Database) {
        super(db);
    }

    async create(): Promise<any> {
        throw new Error('AdminStatsModel is read-only');
    }

    async update(): Promise<any> {
        throw new Error('AdminStatsModel is read-only');
    }

    // =====================================
    // Dashboard statistics (getStats)
    // =====================================

    countUsers(): Promise<{ count: number } | null> {
        return this.db.prepare('SELECT COUNT(*) as count FROM users')
            .first<{ count: number }>();
    }

    countCompetitions(): Promise<{ count: number } | null> {
        return this.db.prepare('SELECT COUNT(*) as count FROM competitions')
            .first<{ count: number }>();
    }

    countPendingReports(): Promise<{ count: number } | null> {
        return this.db.prepare(
            'SELECT COUNT(*) as count FROM reports WHERE status = ?'
        ).bind('pending').first<{ count: number }>();
    }

    countActiveAds(): Promise<{ count: number } | null> {
        return this.db.prepare(
            'SELECT COUNT(*) as count FROM advertisements WHERE is_active = 1'
        ).first<{ count: number }>();
    }

    competitionsByStatus(): Promise<{ results?: StatusCountRow[] }> {
        return this.db.prepare(
            'SELECT status, COUNT(*) as count FROM competitions GROUP BY status'
        ).all<StatusCountRow>();
    }

    totalRevenue(): Promise<{ total: number | null } | null> {
        return this.db.prepare('SELECT SUM(amount) as total FROM user_earnings')
            .first<{ total: number | null }>();
    }

    // =====================================
    // Enhanced dashboard (getEnhancedStats)
    // =====================================

    countActiveUsers(): Promise<{ count: number } | null> {
        return this.db.prepare(
            'SELECT COUNT(*) as count FROM users WHERE is_active = 1'
        ).first<{ count: number }>();
    }

    countArbitrationPending(): Promise<{ count: number } | null> {
        return this.db.prepare(
            "SELECT COUNT(*) as count FROM reports WHERE arbitration_status IN ('submitted', 'under_review', 'investigation')"
        ).first<{ count: number }>();
    }

    countCampaignActiveAds(): Promise<{ count: number } | null> {
        return this.db.prepare(
            "SELECT COUNT(*) as count FROM advertisements WHERE campaign_status = 'active'"
        ).first<{ count: number }>();
    }

    async userCountryDemographics(): Promise<{ results?: CountryDemographicsRow[] }> {
        return this.db.prepare(`
            SELECT country, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY country ORDER BY count DESC LIMIT 10
        `).all<CountryDemographicsRow>();
    }

    async hottestCompetitions(): Promise<{ results?: HotCompetitionRow[] }> {
        return this.db.prepare(`
            SELECT c.id, c.title, c.status, c.total_views, c.creator_rating, c.opponent_rating,
                   cr.display_name as creator_name, op.display_name as opponent_name
            FROM competitions c
            LEFT JOIN users cr ON c.creator_id = cr.id
            LEFT JOIN users op ON c.opponent_id = op.id
            WHERE c.status IN ('live', 'accepted')
            ORDER BY c.total_views DESC LIMIT 5
        `).all();
    }
}

export default AdminStatsModel;
