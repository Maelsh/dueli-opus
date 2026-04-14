/**
 * @file src/models/PlatformFinancialLogModel.ts
 * @description نموذج سجلات المالية للمنصة - Platform Financial Logs Model
 * @module models/PlatformFinancialLogModel
 *
 * OOP Domain Model for platform_financial_logs table.
 * Encapsulates all read/write access to the platform's financial chronicle.
 * Internal memos and raw admin IDs are NEVER exposed outside this model layer.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

// ─────────────────────────────────────────
// Enums & Constants
// ─────────────────────────────────────────

export type FinancialEntryType =
    | 'ad_revenue'
    | 'competitor_payout'
    | 'platform_share'
    | 'server_cost'
    | 'developer_salary'
    | 'admin_salary'
    | 'donor_allocation'
    | 'other_cost';

export const REVENUE_TYPES:  FinancialEntryType[] = ['ad_revenue'];
export const PAYOUT_TYPES:   FinancialEntryType[] = ['competitor_payout'];
export const PLATFORM_TYPES: FinancialEntryType[] = ['platform_share'];
export const OPEX_TYPES:     FinancialEntryType[] = [
    'server_cost', 'developer_salary', 'admin_salary', 'other_cost', 'donor_allocation',
];

// ─────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────

/** Full DB record (internal use only) */
export interface PlatformFinancialLog {
    id: number;
    entry_type: FinancialEntryType;
    amount: number;
    competition_id: number | null;
    ad_id: number | null;
    public_description: string | null;
    internal_memo: string | null;
    period_date: string;
    created_at: string;
}

/** Safe public-facing projection (no PII, no internal memos) */
export interface PublicFinancialLogEntry {
    id: number;
    entry_type: FinancialEntryType;
    amount: number;
    public_description: string | null;
    period_date: string;
    created_at: string;
}

/** Create payload */
export interface CreateFinancialLogData {
    entry_type: FinancialEntryType;
    amount: number;
    competition_id?: number;
    ad_id?: number;
    public_description?: string;
    internal_memo?: string;
    period_date?: string; // defaults to today
}

/** Aggregated daily summary DTO */
export interface DailySummary {
    period_date: string;
    total_ad_revenue: number;
    total_competitor_payouts: number;
    total_platform_share: number;
    total_operating_costs: number;
    total_donor_allocation: number;
    net_platform: number;
}

/** Totals across all time */
export interface PlatformFinancialTotals {
    total_ad_revenue: number;
    total_competitor_payouts: number;
    total_platform_share: number;
    total_operating_costs: number;
    total_donor_allocation: number;
    entry_count: number;
}

// ─────────────────────────────────────────
// Model
// ─────────────────────────────────────────

/**
 * PlatformFinancialLogModel
 *
 * Domain model responsible for all platform-level financial entries.
 * Separates internal storage from public projection — internal_memo
 * and raw IDs are stripped before returning public data.
 */
export class PlatformFinancialLogModel extends BaseModel<PlatformFinancialLog> {
    protected readonly tableName = 'platform_financial_logs';

    constructor(db: D1Database) {
        super(db);
    }

    // ── Required abstract implementations ──────────────

    async create(data: Partial<PlatformFinancialLog>): Promise<PlatformFinancialLog> {
        const today = new Date().toISOString().slice(0, 10);
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
                (entry_type, amount, competition_id, ad_id, public_description, internal_memo, period_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.entry_type,
            data.amount ?? 0,
            data.competition_id ?? null,
            data.ad_id         ?? null,
            data.public_description ?? null,
            data.internal_memo      ?? null,
            data.period_date        ?? today,
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create platform_financial_log entry');
    }

    async update(id: number, data: Partial<PlatformFinancialLog>): Promise<PlatformFinancialLog | null> {
        const updates: string[] = [];
        const values: any[]    = [];

        if (data.public_description !== undefined) {
            updates.push('public_description = ?');
            values.push(data.public_description);
        }
        if (data.internal_memo !== undefined) {
            updates.push('internal_memo = ?');
            values.push(data.internal_memo);
        }
        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    // ── Domain Methods ──────────────────────────────────

    /**
     * Record a new financial event.
     */
    async record(data: CreateFinancialLogData): Promise<PlatformFinancialLog> {
        return this.create({
            entry_type:         data.entry_type,
            amount:             data.amount,
            competition_id:     data.competition_id,
            ad_id:              data.ad_id,
            public_description: data.public_description,
            internal_memo:      data.internal_memo,
            period_date:        data.period_date ?? new Date().toISOString().slice(0, 10),
        });
    }

    /**
     * Return aggregated totals across all time (no PII).
     */
    async getTotals(): Promise<PlatformFinancialTotals> {
        const row = await this.queryOne<PlatformFinancialTotals>(`
            SELECT
                COALESCE(SUM(CASE WHEN entry_type = 'ad_revenue'        THEN amount ELSE 0 END), 0) AS total_ad_revenue,
                COALESCE(SUM(CASE WHEN entry_type = 'competitor_payout' THEN amount ELSE 0 END), 0) AS total_competitor_payouts,
                COALESCE(SUM(CASE WHEN entry_type = 'platform_share'    THEN amount ELSE 0 END), 0) AS total_platform_share,
                COALESCE(SUM(CASE WHEN entry_type IN (
                    'server_cost','developer_salary','admin_salary','other_cost'
                )                                                        THEN amount ELSE 0 END), 0) AS total_operating_costs,
                COALESCE(SUM(CASE WHEN entry_type = 'donor_allocation'  THEN amount ELSE 0 END), 0) AS total_donor_allocation,
                COUNT(*)                                                                             AS entry_count
            FROM ${this.tableName}
        `);

        return row ?? {
            total_ad_revenue: 0, total_competitor_payouts: 0,
            total_platform_share: 0, total_operating_costs: 0,
            total_donor_allocation: 0, entry_count: 0,
        };
    }

    /**
     * Return daily aggregated summaries (most-recent first).
     */
    async getDailySummaries(limit = 30): Promise<DailySummary[]> {
        return this.query<DailySummary>(`
            SELECT
                period_date,
                COALESCE(SUM(CASE WHEN entry_type = 'ad_revenue'        THEN amount ELSE 0 END), 0) AS total_ad_revenue,
                COALESCE(SUM(CASE WHEN entry_type = 'competitor_payout' THEN amount ELSE 0 END), 0) AS total_competitor_payouts,
                COALESCE(SUM(CASE WHEN entry_type = 'platform_share'    THEN amount ELSE 0 END), 0) AS total_platform_share,
                COALESCE(SUM(CASE WHEN entry_type IN (
                    'server_cost','developer_salary','admin_salary','other_cost'
                )                                                        THEN amount ELSE 0 END), 0) AS total_operating_costs,
                COALESCE(SUM(CASE WHEN entry_type = 'donor_allocation'  THEN amount ELSE 0 END), 0) AS total_donor_allocation,
                (
                    COALESCE(SUM(CASE WHEN entry_type = 'ad_revenue'        THEN amount ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN entry_type IN (
                        'server_cost','developer_salary','admin_salary','other_cost'
                      )                                                      THEN amount ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN entry_type = 'donor_allocation' THEN amount ELSE 0 END), 0)
                ) AS net_platform
            FROM ${this.tableName}
            GROUP BY period_date
            ORDER BY period_date DESC
            LIMIT ?
        `, limit);
    }

    /**
     * Get today's summary for the dashboard hero stats.
     */
    async getTodaySummary(): Promise<DailySummary> {
        const today = new Date().toISOString().slice(0, 10);
        const row = await this.queryOne<DailySummary>(`
            SELECT
                period_date,
                COALESCE(SUM(CASE WHEN entry_type = 'ad_revenue'        THEN amount ELSE 0 END), 0) AS total_ad_revenue,
                COALESCE(SUM(CASE WHEN entry_type = 'competitor_payout' THEN amount ELSE 0 END), 0) AS total_competitor_payouts,
                COALESCE(SUM(CASE WHEN entry_type = 'platform_share'    THEN amount ELSE 0 END), 0) AS total_platform_share,
                COALESCE(SUM(CASE WHEN entry_type IN (
                    'server_cost','developer_salary','admin_salary','other_cost'
                )                                                        THEN amount ELSE 0 END), 0) AS total_operating_costs,
                COALESCE(SUM(CASE WHEN entry_type = 'donor_allocation'  THEN amount ELSE 0 END), 0) AS total_donor_allocation,
                (
                    COALESCE(SUM(CASE WHEN entry_type = 'ad_revenue'        THEN amount ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN entry_type IN (
                        'server_cost','developer_salary','admin_salary','other_cost'
                      )                                                      THEN amount ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN entry_type = 'donor_allocation' THEN amount ELSE 0 END), 0)
                ) AS net_platform
            FROM ${this.tableName}
            WHERE period_date = ?
        `, today);

        return row ?? {
            period_date: today,
            total_ad_revenue: 0, total_competitor_payouts: 0,
            total_platform_share: 0, total_operating_costs: 0,
            total_donor_allocation: 0, net_platform: 0,
        };
    }

    /**
     * Fetch recent public-safe entries for the live feed (no internal_memo).
     */
    async getPublicFeed(limit = 20, offset = 0): Promise<PublicFinancialLogEntry[]> {
        return this.query<PublicFinancialLogEntry>(`
            SELECT id, entry_type, amount, public_description, period_date, created_at
            FROM ${this.tableName}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, limit, offset);
    }

    /**
     * Fetch entries for a specific period (public projection).
     */
    async getByPeriod(periodDate: string, limit = 50): Promise<PublicFinancialLogEntry[]> {
        return this.query<PublicFinancialLogEntry>(`
            SELECT id, entry_type, amount, public_description, period_date, created_at
            FROM ${this.tableName}
            WHERE period_date = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, periodDate, limit);
    }

    /**
     * Returns payroll breakdown by type (developer_salary + admin_salary).
     * Numbers only — no names, no individual rows that could identify anyone.
     */
    async getPayrollSummary(): Promise<{ entry_type: string; total: number; count: number }[]> {
        return this.query(`
            SELECT entry_type, SUM(amount) AS total, COUNT(*) AS count
            FROM ${this.tableName}
            WHERE entry_type IN ('developer_salary', 'admin_salary')
            GROUP BY entry_type
            ORDER BY entry_type
        `);
    }
}

export default PlatformFinancialLogModel;
