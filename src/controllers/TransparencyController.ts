/**
 * @file src/controllers/TransparencyController.ts
 * @description متحكم الشفافية المالية العامة (8.F) — ربط HTTP فقط.
 *              كل المنطق في MoneyTransparencyService / LedgerService.
 * @module controllers/TransparencyController
 *
 * المساران عامّان (مثل بقية /api/transparency — open-book ledger):
 * - GET /api/transparency/summary — مجاميع من ledger + بصمة، بلا هوية.
 * - GET /api/transparency/verify  — نتيجة LedgerService.verifyInvariant()
 *   مباشرة، بلا خوارزمية تحقق ثانية.
 */

import { BaseController, AppContext } from './base/BaseController';
import { t } from '../i18n';
import { LedgerService } from '../lib/services/LedgerService';
import { MoneyTransparencyService, TRANSPARENCY_CACHE_TTL_MS } from '../lib/services/MoneyTransparencyService';

const CURRENCY_RE = /^[A-Z]{3}$/;

export class TransparencyController extends BaseController {
    private readonly service: MoneyTransparencyService;
    private readonly ledger: LedgerService;

    constructor(db: D1Database) {
        super();
        this.service = new MoneyTransparencyService(db);
        this.ledger = new LedgerService(db);
    }

    /** GET /api/transparency/summary — مجاميع عامة مشتقة من ledger فقط. */
    async summary(c: AppContext) {
        try {
            const currency = (c.req.query('currency') ?? 'USD').toUpperCase();
            if (!CURRENCY_RE.test(currency)) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            const s = await this.service.getSummary(currency);
            const lang = this.getLanguage(c);
            return this.success(c, {
                total_in_cents: s.totalInCents,
                total_out_cents: s.totalOutCents,
                platform_share_cents: s.platformShareCents,
                currency: s.currency,
                verified_at: s.verifiedAt,
                fingerprint: s.fingerprint,
                cached: s.cached,
                cache_ttl_ms: TRANSPARENCY_CACHE_TTL_MS,
                labels: {
                    total_in: t('transparency.total_in', lang),
                    total_out: t('transparency.total_out', lang),
                    platform_share: t('transparency.platform_share', lang),
                    verified_at: t('transparency.verified_at', lang),
                },
            });
        } catch (e) {
            return this.serverError(c, e as Error);
        }
    }

    /**
     * GET /api/transparency/verify — يعيد نتيجة verifyInvariant() نفسها.
     * لا حساب موازٍ هنا: النداء مفوَّض بالكامل إلى LedgerService.
     */
    async verify(c: AppContext) {
        try {
            const currency = (c.req.query('currency') ?? 'USD').toUpperCase();
            if (!CURRENCY_RE.test(currency)) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            const inv = await this.ledger.verifyInvariant(currency);
            return this.success(c, {
                totalDebitCents: inv.totalDebitCents,
                totalCreditCents: inv.totalCreditCents,
                difference: inv.difference,
                balanced: inv.difference === 0,
                currency,
                verified_at: new Date().toISOString(),
            });
        } catch (e) {
            return this.serverError(c, e as Error);
        }
    }
}

export default TransparencyController;
