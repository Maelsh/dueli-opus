/**
 * @file src/models/PlatformDonationsLedgerModel.ts
 * @description نموذج دفتر تبرعات المنصة - Platform Donations Ledger Model
 * @module models/PlatformDonationsLedgerModel
 *
 * OOP Domain Model for platform_donations_ledger table.
 * Records both inbound donor contributions and how those funds
 * are allocated to operational expenses.  source_donation_id is
 * internal and never returned by public-facing methods.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

// ─────────────────────────────────────────
// Enums & Types
// ─────────────────────────────────────────

export type DonationLedgerType = 'donation_received' | 'donation_allocated';

// ─────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────

/** Full DB record (internal) */
export interface PlatformDonationsLedger {
    id: number;
    ledger_type: DonationLedgerType;
    amount: number;
    donor_display_name: string | null;
    donor_message: string | null;
    source_donation_id: number | null;
    linked_log_id: number | null;
    public_description: string | null;
    period_date: string;
    created_at: string;
}

/** Public-safe projection — no source_donation_id */
export interface PublicDonationLedgerEntry {
    id: number;
    ledger_type: DonationLedgerType;
    amount: number;
    donor_display_name: string | null;
    donor_message: string | null;
    public_description: string | null;
    period_date: string;
    created_at: string;
}

/** Create payload */
export interface CreateDonationLedgerData {
    ledger_type: DonationLedgerType;
    amount: number;
    donor_display_name?: string;
    donor_message?: string;
    source_donation_id?: number;
    linked_log_id?: number;
    public_description?: string;
    period_date?: string;
}

/** Aggregated stats for the ledger summary card */
export interface DonationLedgerStats {
    total_received: number;
    total_allocated: number;
    unallocated_balance: number;
    donation_count: number;
}

// ─────────────────────────────────────────
// Model
// ─────────────────────────────────────────

/**
 * PlatformDonationsLedgerModel
 *
 * Domain model for the publicly-auditable donations ledger.
 * Inbound donations appear as 'donation_received' entries;
 * when those funds are applied to server/salary costs they
 * appear as 'donation_allocated' entries.
 */
export class PlatformDonationsLedgerModel extends BaseModel<PlatformDonationsLedger> {
    protected readonly tableName = 'platform_donations_ledger';

    constructor(db: D1Database) {
        super(db);
    }

    // ── Required abstract implementations ──────────────

    async create(data: Partial<PlatformDonationsLedger>): Promise<PlatformDonationsLedger> {
        const today = new Date().toISOString().slice(0, 10);
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
                (ledger_type, amount, donor_display_name, donor_message,
                 source_donation_id, linked_log_id, public_description, period_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.ledger_type,
            data.amount ?? 0,
            data.donor_display_name  ?? null,
            data.donor_message       ?? null,
            data.source_donation_id  ?? null,
            data.linked_log_id       ?? null,
            data.public_description  ?? null,
            data.period_date         ?? today,
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create platform_donations_ledger entry');
    }

    async update(id: number, data: Partial<PlatformDonationsLedger>): Promise<PlatformDonationsLedger | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.public_description !== undefined) {
            updates.push('public_description = ?');
            values.push(data.public_description);
        }
        if (data.donor_message !== undefined) {
            updates.push('donor_message = ?');
            values.push(data.donor_message);
        }
        if (data.linked_log_id !== undefined) {
            updates.push('linked_log_id = ?');
            values.push(data.linked_log_id);
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
     * Record a new ledger entry (both received and allocations).
     */
    async record(data: CreateDonationLedgerData): Promise<PlatformDonationsLedger> {
        return this.create({
            ledger_type:        data.ledger_type,
            amount:             data.amount,
            donor_display_name: data.donor_display_name,
            donor_message:      data.donor_message,
            source_donation_id: data.source_donation_id,
            linked_log_id:      data.linked_log_id,
            public_description: data.public_description,
            period_date:        data.period_date ?? new Date().toISOString().slice(0, 10),
        });
    }

    /**
     * Aggregated totals for the transparency stats card.
     */
    async getStats(): Promise<DonationLedgerStats> {
        const row = await this.queryOne<{
            total_received: number;
            total_allocated: number;
            donation_count: number;
        }>(`
            SELECT
                COALESCE(SUM(CASE WHEN ledger_type = 'donation_received'  THEN amount ELSE 0 END), 0) AS total_received,
                COALESCE(SUM(CASE WHEN ledger_type = 'donation_allocated' THEN amount ELSE 0 END), 0) AS total_allocated,
                COUNT(CASE WHEN ledger_type = 'donation_received' THEN 1 END)                          AS donation_count
            FROM ${this.tableName}
        `);

        const total_received  = row?.total_received  ?? 0;
        const total_allocated = row?.total_allocated ?? 0;

        return {
            total_received,
            total_allocated,
            unallocated_balance: total_received - total_allocated,
            donation_count: row?.donation_count ?? 0,
        };
    }

    /**
     * Public ledger feed — strips source_donation_id.
     */
    async getPublicFeed(limit = 20, offset = 0): Promise<PublicDonationLedgerEntry[]> {
        return this.query<PublicDonationLedgerEntry>(`
            SELECT id, ledger_type, amount, donor_display_name, donor_message,
                   public_description, period_date, created_at
            FROM ${this.tableName}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, limit, offset);
    }

    /**
     * Most-generous donors for the hall-of-fame widget.
     */
    async getTopDonors(limit = 10): Promise<{ donor_display_name: string; total_donated: number }[]> {
        return this.query<{ donor_display_name: string; total_donated: number }>(`
            SELECT
                COALESCE(donor_display_name, 'Anonymous') AS donor_display_name,
                SUM(amount) AS total_donated
            FROM ${this.tableName}
            WHERE ledger_type = 'donation_received'
            GROUP BY donor_display_name
            ORDER BY total_donated DESC
            LIMIT ?
        `, limit);
    }

    /**
     * Monthly donation totals for chart rendering.
     */
    async getMonthlyTotals(months = 6): Promise<{ month: string; total: number }[]> {
        return this.query<{ month: string; total: number }>(`
            SELECT
                strftime('%Y-%m', period_date) AS month,
                SUM(amount) AS total
            FROM ${this.tableName}
            WHERE ledger_type = 'donation_received'
            GROUP BY month
            ORDER BY month DESC
            LIMIT ?
        `, months);
    }
}

export default PlatformDonationsLedgerModel;
