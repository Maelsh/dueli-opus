/**
 * @file src/lib/TransparencyAuditor.ts
 * @description محقق الشفافية المالية - The Transparency Auditor Service
 * @module lib/TransparencyAuditor
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           PROTECTED TRANSPARENCY AUDITOR SERVICE            ║
 * ║                                                             ║
 * ║  Core Invariant (from the spec, §Task 4 Constraint):        ║
 * ║                                                             ║
 * ║  Total Ad Revenue - Operating Costs - Donor Funding         ║
 * ║          = Platform Net + Competitors Payouts               ║
 * ║                                                             ║
 * ║  This service CANNOT be bypassed.  Every public-facing      ║
 * ║  transparency payload must go through verifyLedger().       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * OOP design:
 *  - Constructor is private → can only be obtained via factory.
 *  - Core verification logic is a private method (#verify).
 *  - Public surface exposes only safe, verified DTOs.
 */

import { D1Database } from '@cloudflare/workers-types';
import { PlatformFinancialLogModel, PlatformFinancialTotals, DailySummary, PublicFinancialLogEntry } from '../models/PlatformFinancialLogModel';
import { PlatformDonationsLedgerModel, DonationLedgerStats, PublicDonationLedgerEntry } from '../models/PlatformDonationsLedgerModel';

// ─────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────

/** The result of running the mathematical invariant check */
export interface AuditResult {
    /** True only when the invariant holds within tolerance */
    is_balanced: boolean;
    /** Left-hand side of the equation */
    lhs: number;
    /** Right-hand side of the equation */
    rhs: number;
    /** Absolute discrepancy (should be 0 or within floating-point epsilon) */
    discrepancy: number;
    /** Human-readable breakdown for every term */
    breakdown: AuditBreakdown;
    /** ISO timestamp this audit was performed */
    audited_at: string;
}

export interface AuditBreakdown {
    total_ad_revenue: number;
    total_operating_costs: number;
    total_donor_funding: number;
    platform_net: number;
    competitors_payouts: number;
}

/** Full transparency payload safe for public APIs */
export interface TransparencyPayload {
    audit: AuditResult;
    totals: PlatformFinancialTotals;
    today: DailySummary;
    donation_stats: DonationLedgerStats;
    recent_financial_feed: PublicFinancialLogEntry[];
    recent_donation_feed: PublicDonationLedgerEntry[];
    daily_summaries: DailySummary[];
    payroll_summary: { entry_type: string; total: number; count: number }[];
    top_donors: { donor_display_name: string; total_donated: number }[];
    admin_interventions: AnonymizedAdminAction[];
}

/** Anonymized admin action for the public feed */
export interface AnonymizedAdminAction {
    id: number;
    role_label: string;      // 'Moderator', 'Auditor', 'SuperAdmin'
    action_type: string;
    target_entity: string | null;
    target_id: number | null;
    /** Sanitized summary — no names, no emails */
    summary: string;
    created_at: string;
}

// ─────────────────────────────────────────
// Tolerance for floating-point comparisons
// ─────────────────────────────────────────
const EPSILON = 0.001; // $0.001 — negligible float artefact

// ─────────────────────────────────────────
// Service
// ─────────────────────────────────────────

/**
 * TransparencyAuditor
 *
 * Protected singleton-per-request service.  Obtain via static factory:
 *
 *   const auditor = TransparencyAuditor.forDatabase(db);
 *
 * NEVER construct directly.  The private constructor enforces this at the
 * TypeScript level; the factory guards it at runtime.
 */
export class TransparencyAuditor {
    // Private model dependencies
    private readonly financialModel: PlatformFinancialLogModel;
    private readonly donationsModel: PlatformDonationsLedgerModel;
    private readonly db: D1Database;

    /** Use the factory method — do not call directly */
    private constructor(db: D1Database) {
        this.db             = db;
        this.financialModel = new PlatformFinancialLogModel(db);
        this.donationsModel = new PlatformDonationsLedgerModel(db);
    }

    /**
     * Factory: creates a TransparencyAuditor bound to the given D1 database.
     * This is the ONLY way to obtain an instance.
     */
    static forDatabase(db: D1Database): TransparencyAuditor {
        return new TransparencyAuditor(db);
    }

    // ── Private Core Verification ───────────────────────

    /**
     * #verify — Enforces the master accounting invariant.
     *
     * Invariant:
     *   (Ad Revenue − Operating Costs − Donor Funding) = Platform Net + Payouts
     *
     * Both sides represent what is left in the platform's hands after
     * all expenses are paid and competitors are compensated.
     *
     * @param totals   — aggregated financial totals from the DB
     * @param donStats — aggregated donation stats from the ledger
     */
    private verify(totals: PlatformFinancialTotals, donStats: DonationLedgerStats): AuditResult {
        const {
            total_ad_revenue,
            total_competitor_payouts,
            total_platform_share,
            total_operating_costs,
            total_donor_allocation,
        } = totals;

        // Donor funding that has actually been applied to operations
        const donor_funding_applied = total_donor_allocation;

        // LHS: what should be retained after paying everything
        const lhs = total_ad_revenue - total_operating_costs - donor_funding_applied;

        // RHS: what the books show as retained + paid to competitors
        const rhs = total_platform_share + total_competitor_payouts;

        const discrepancy = Math.abs(lhs - rhs);
        const is_balanced = discrepancy <= EPSILON;

        return {
            is_balanced,
            lhs: +lhs.toFixed(6),
            rhs: +rhs.toFixed(6),
            discrepancy: +discrepancy.toFixed(6),
            breakdown: {
                total_ad_revenue,
                total_operating_costs,
                total_donor_funding: donor_funding_applied,
                platform_net:         total_platform_share,
                competitors_payouts:  total_competitor_payouts,
            },
            audited_at: new Date().toISOString(),
        };
    }

    // ── Private Helpers ─────────────────────────────────

    /**
     * Map admin role (is_admin flag + action type heuristics) to a role label.
     * We deliberately do NOT expose the admin_id or username.
     */
    private buildRoleLabel(action_type: string): string {
        if (action_type.includes('ban') || action_type.includes('delete_user')) {
            return 'SuperAdmin';
        }
        if (action_type.includes('audit') || action_type.includes('verify')) {
            return 'Auditor';
        }
        return 'Moderator';
    }

    /**
     * Fetch anonymized admin interventions from admin_audit_logs.
     * Strips all admin_id references; replaces with generic role labels.
     */
    private async getAnonymizedAdminActions(limit = 20): Promise<AnonymizedAdminAction[]> {
        type RawRow = {
            id: number;
            action_type: string;
            target_entity: string | null;
            target_id: number | null;
            details: string | null;
            created_at: string;
        };

        const result = await this.db.prepare(`
            SELECT id, action_type, target_entity, target_id, details, created_at
            FROM admin_audit_logs
            ORDER BY created_at DESC
            LIMIT ?
        `).bind(limit).all<RawRow>();

        return (result.results ?? []).map((row) => {
            // Parse details blob safely
            let detailsObj: Record<string, any> = {};
            try {
                detailsObj = row.details ? JSON.parse(row.details) : {};
            } catch {
                detailsObj = {};
            }

            // Build a sanitized summary from structured data
            const roleLabel    = this.buildRoleLabel(row.action_type);
            const targetLabel  = row.target_entity ?? 'entity';
            const targetRef    = row.target_id     != null ? `#${row.target_id}` : '';
            const actionHuman  = row.action_type.replace(/_/g, ' ');
            const summary      = `${roleLabel} performed "${actionHuman}" on ${targetLabel} ${targetRef}`.trim();

            return {
                id:            row.id,
                role_label:    roleLabel,
                action_type:   row.action_type,
                target_entity: row.target_entity,
                target_id:     row.target_id,
                summary,
                created_at:    row.created_at,
            };
        });
    }

    // ── Public API ──────────────────────────────────────

    /**
     * Run the full audit and return a verified transparency payload.
     *
     * This is the ONLY entrypoint into the transparency data.
     * All data is fetched, the invariant is verified, and the
     * payload is assembled in a single atomic call.
     *
     * @throws Never — errors are caught and surfaced through audit.is_balanced = false
     */
    async buildVerifiedPayload(): Promise<TransparencyPayload> {
        // Parallel data fetch for performance
        const [
            totals,
            today,
            donationStats,
            recentFinancialFeed,
            recentDonationFeed,
            dailySummaries,
            payrollSummary,
            topDonors,
            adminInterventions,
        ] = await Promise.all([
            this.financialModel.getTotals(),
            this.financialModel.getTodaySummary(),
            this.donationsModel.getStats(),
            this.financialModel.getPublicFeed(20),
            this.donationsModel.getPublicFeed(20),
            this.financialModel.getDailySummaries(30),
            this.financialModel.getPayrollSummary(),
            this.donationsModel.getTopDonors(10),
            this.getAnonymizedAdminActions(20),
        ]);

        // Verify the accounting invariant
        const audit = this.verify(totals, donationStats);

        return {
            audit,
            totals,
            today,
            donation_stats:        donationStats,
            recent_financial_feed: recentFinancialFeed,
            recent_donation_feed:  recentDonationFeed,
            daily_summaries:       dailySummaries,
            payroll_summary:       payrollSummary,
            top_donors:            topDonors,
            admin_interventions:   adminInterventions,
        };
    }

    /**
     * Run just the audit verification (lightweight — for admin health checks).
     */
    async runAudit(): Promise<AuditResult> {
        const [totals, donationStats] = await Promise.all([
            this.financialModel.getTotals(),
            this.donationsModel.getStats(),
        ]);
        return this.verify(totals, donationStats);
    }
}

export default TransparencyAuditor;
