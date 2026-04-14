import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export interface CompetitionRevenueLog {
    id: number;
    competition_id: number;
    total_ad_revenue: number;
    platform_share: number;
    creator_share: number;
    opponent_share: number;
    creator_rating_at_time: number;
    opponent_rating_at_time: number;
    platform_percentage: number;
    finalized: number;
    finalized_at: string | null;
    created_at: string;
    updated_at: string;
}

export class CompetitionRevenueLogModel extends BaseModel<CompetitionRevenueLog> {
    protected readonly tableName = 'competition_revenue_logs';

    constructor(db: D1Database) {
        super(db);
    }

    async create(data: Partial<CompetitionRevenueLog>): Promise<CompetitionRevenueLog> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
            (competition_id, total_ad_revenue, platform_share, creator_share, opponent_share,
             creator_rating_at_time, opponent_rating_at_time, platform_percentage, finalized, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
        `).bind(
            data.competition_id,
            data.total_ad_revenue || 0,
            data.platform_share || 0,
            data.creator_share || 0,
            data.opponent_share || 0,
            data.creator_rating_at_time || 0,
            data.opponent_rating_at_time || 0,
            data.platform_percentage || 20
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create competition revenue log');
    }

    async update(id: number, data: Partial<CompetitionRevenueLog>): Promise<CompetitionRevenueLog | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.total_ad_revenue !== undefined) { updates.push('total_ad_revenue = ?'); values.push(data.total_ad_revenue); }
        if (data.platform_share !== undefined) { updates.push('platform_share = ?'); values.push(data.platform_share); }
        if (data.creator_share !== undefined) { updates.push('creator_share = ?'); values.push(data.creator_share); }
        if (data.opponent_share !== undefined) { updates.push('opponent_share = ?'); values.push(data.opponent_share); }
        if (data.creator_rating_at_time !== undefined) { updates.push('creator_rating_at_time = ?'); values.push(data.creator_rating_at_time); }
        if (data.opponent_rating_at_time !== undefined) { updates.push('opponent_rating_at_time = ?'); values.push(data.opponent_rating_at_time); }
        if (data.finalized !== undefined) { updates.push('finalized = ?'); values.push(data.finalized); }

        if (updates.length === 0) return this.findById(id);

        updates.push("updated_at = datetime('now')");
        values.push(id);

        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    async findByCompetitionId(competitionId: number): Promise<CompetitionRevenueLog | null> {
        return this.findOne('competition_id', competitionId);
    }

    async finalize(competitionId: number): Promise<CompetitionRevenueLog | null> {
        const log = await this.findByCompetitionId(competitionId);
        if (!log) return null;

        await this.db.prepare(`
            UPDATE ${this.tableName} SET finalized = 1, finalized_at = datetime('now'), updated_at = datetime('now')
            WHERE competition_id = ?
        `).bind(competitionId).run();

        return this.findByCompetitionId(competitionId);
    }

    async upsertByCompetition(data: Partial<CompetitionRevenueLog>): Promise<CompetitionRevenueLog> {
        const existing = await this.findByCompetitionId(data.competition_id!);
        if (existing) {
            const updated = await this.update(existing.id, data);
            return updated!;
        }
        return this.create(data);
    }
}

export default CompetitionRevenueLogModel;
