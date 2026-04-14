/**
 * @file src/modules/api/transparency/routes.ts
 * @description مسارات API محرك الشفافية - Transparency Engine API Routes
 * @module api/transparency/routes
 *
 * All routes are PUBLIC (no auth required) — this is the open-book ledger.
 * Sensitive data is anonymized by TransparencyAuditor before reaching here.
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { TransparencyAuditor } from '../../../lib/TransparencyAuditor';
import { PlatformFinancialLogModel } from '../../../models/PlatformFinancialLogModel';
import { PlatformDonationsLedgerModel } from '../../../models/PlatformDonationsLedgerModel';

const transparencyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ──────────────────────────────────────────────────────────────────
// GET /api/transparency
// Master endpoint — returns the FULL verified transparency payload.
// The TransparencyAuditor is the only path to this data.
// ──────────────────────────────────────────────────────────────────
transparencyRoutes.get('/', async (c) => {
    try {
        const auditor = TransparencyAuditor.forDatabase(c.env.DB);
        const payload = await auditor.buildVerifiedPayload();

        return c.json({
            success: true,
            data: payload,
        });
    } catch (error) {
        console.error('[Transparency] Full payload error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to build transparency payload' },
        }, 500);
    }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/transparency/audit
// Lightweight audit-only endpoint — just the invariant check result.
// ──────────────────────────────────────────────────────────────────
transparencyRoutes.get('/audit', async (c) => {
    try {
        const auditor = TransparencyAuditor.forDatabase(c.env.DB);
        const audit   = await auditor.runAudit();

        return c.json({
            success: true,
            data: audit,
        });
    } catch (error) {
        console.error('[Transparency] Audit error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to run audit' },
        }, 500);
    }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/transparency/feed
// Paginated public financial log feed.
// Query params: ?limit=20&offset=0
// ──────────────────────────────────────────────────────────────────
transparencyRoutes.get('/feed', async (c) => {
    try {
        const limit  = Math.min(parseInt(c.req.query('limit')  ?? '20'), 100);
        const offset = Math.max(parseInt(c.req.query('offset') ?? '0'),  0);

        const financialModel = new PlatformFinancialLogModel(c.env.DB);
        const feed           = await financialModel.getPublicFeed(limit, offset);

        return c.json({
            success: true,
            data: { feed, limit, offset },
        });
    } catch (error) {
        console.error('[Transparency] Financial feed error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to fetch financial feed' },
        }, 500);
    }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/transparency/donations-feed
// Paginated public donations ledger feed.
// ──────────────────────────────────────────────────────────────────
transparencyRoutes.get('/donations-feed', async (c) => {
    try {
        const limit  = Math.min(parseInt(c.req.query('limit')  ?? '20'), 100);
        const offset = Math.max(parseInt(c.req.query('offset') ?? '0'),  0);

        const donationsModel = new PlatformDonationsLedgerModel(c.env.DB);
        const feed           = await donationsModel.getPublicFeed(limit, offset);

        return c.json({
            success: true,
            data: { feed, limit, offset },
        });
    } catch (error) {
        console.error('[Transparency] Donations feed error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to fetch donations feed' },
        }, 500);
    }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/transparency/daily?date=YYYY-MM-DD
// Single-day aggregated breakdown.
// ──────────────────────────────────────────────────────────────────
transparencyRoutes.get('/daily', async (c) => {
    try {
        const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);

        // Basic date format validation
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return c.json({
                success: false,
                error: { message: 'Invalid date format. Use YYYY-MM-DD' },
            }, 400);
        }

        const financialModel = new PlatformFinancialLogModel(c.env.DB);
        const [entries, summaries] = await Promise.all([
            financialModel.getByPeriod(date, 100),
            financialModel.getDailySummaries(1),
        ]);

        return c.json({
            success: true,
            data: {
                date,
                entries,
                summary: summaries[0] ?? null,
            },
        });
    } catch (error) {
        console.error('[Transparency] Daily breakdown error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to fetch daily breakdown' },
        }, 500);
    }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/transparency/payroll
// Payroll numbers only — no names, no individual rows.
// ──────────────────────────────────────────────────────────────────
transparencyRoutes.get('/payroll', async (c) => {
    try {
        const financialModel = new PlatformFinancialLogModel(c.env.DB);
        const payroll        = await financialModel.getPayrollSummary();

        return c.json({
            success: true,
            data: { payroll },
        });
    } catch (error) {
        console.error('[Transparency] Payroll error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to fetch payroll summary' },
        }, 500);
    }
});

export default transparencyRoutes;
