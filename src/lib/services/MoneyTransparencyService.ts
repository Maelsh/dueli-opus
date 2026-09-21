/**
 * MoneyTransparencyService — مجاميع الشفافية المالية العامة (المهمة 8.F)
 *
 * المصدر الوحيد للحقيقة: `ledger_entries` — لا جدول مالي موازٍ، لا عمود
 * رصيد مكرر، لا حسابات عائمة (integer cents فقط).
 *
 * التعريفات (مشتقة من semantics الحالية — بلا سياسة مخترعة):
 * - totalInCents: مجموع الأرجل الدائنة على حسابات `reserve:*`.
 *   كل تدفق إجمالي يكتب ساق reserve دائنة واحدة بالمبلغ الكامل:
 *   capture ‏8.C/8.E ← ‏`reserve:gateway` (StripeWebhookService)،
 *   وتوزيع 8.B ← ‏`reserve:payouts` (LivePayoutEngine).
 * - totalOutCents: مجموع الأرجل المدينة على حسابات `user:*`.
 *   كل كسب مستخدم هو ساق user مدينة واحدة: حصص 8.B (creator/opponent)
 *   + صافي تبرع 8.E للمستلم.
 * - platformShareCents: صافي أرصدة `platform:*` (مدين − دائن، بنفس دلالة
 *   LedgerService.balance): رسوم/حصص `platform:revenue` مطروحاً منها
 *   المردودات الدائنة + صافي حجوزات `platform:withdrawals`.
 *
 * الـcache ليس مصدراً للحقيقة: ذاكرة داخلية بمهلة موثقة (TTL) + بصمة
 * (fingerprint) + فحص عدّ القيود. أي كتابة ledger جديدة تزيد العدّ
 * (الجدول append-only — لا UPDATE/DELETE) فيُعاد الحساب تلقائياً،
 * وبعد انتهاء الـTTL يُعاد الحساب حتماً.
 */

import type { D1Database } from '@cloudflare/workers-types';

/** مهلة الـcache الموثقة: 60 ثانية. */
export const TRANSPARENCY_CACHE_TTL_MS = 60_000;

/** ملخص الشفافية العامة — مجاميع فقط، بلا أي هوية. */
export interface MoneyTransparencySummary {
    /** مجموع reserve credits بالسنت (عدد صحيح). */
    totalInCents: number;
    /** مجموع user debits بالسنت (عدد صحيح). */
    totalOutCents: number;
    /** صافي platform (مدين − دائن) بالسنت (عدد صحيح). */
    platformShareCents: number;
    /** العملة (3 أحرف). */
    currency: string;
    /** وقت الحساب (ISO). */
    verifiedAt: string;
    /** بصمة تسمح بإثبات تطابق القيمة مع الحساب الحقيقي. */
    fingerprint: string;
    /** true ⇒ أُعيدت قيمة مخزنة صالحة؛ false ⇒ حُسبت الآن من ledger. */
    cached: boolean;
}

interface CacheEntry {
    totalInCents: number;
    totalOutCents: number;
    platformShareCents: number;
    verifiedAt: string;
    fingerprint: string;
    entryCount: number;
    expiresAtMs: number;
}

/**
 * بصمة حتمية من الأرقام + عدّ القيود (حساب صحيح فقط — djb2، بلا float).
 * أي اختلاف في ledger أو في المجاميع ⇒ بصمة مختلفة.
 */
export function fingerprintSummary(parts: {
    currency: string;
    totalInCents: number;
    totalOutCents: number;
    platformShareCents: number;
    entryCount: number;
}): string {
    const text = `${parts.currency}:${parts.totalInCents}:${parts.totalOutCents}:${parts.platformShareCents}:${parts.entryCount}`;
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash * 33 + text.charCodeAt(i)) | 0) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export class MoneyTransparencyService {
    private static readonly cache = new Map<string, CacheEntry>();

    constructor(private readonly db: D1Database) {}

    /** إبطال الـcache (انتهاء TTL / اختبارات) — القادم يُحسب من ledger. */
    static clearCache(): void {
        MoneyTransparencyService.cache.clear();
    }

    /**
     * المجاميع العامة من ledger مباشرة (أو من الـcache الصالح).
     * لا تكتب شيئاً في قاعدة البيانات — قراءة فقط.
     */
    async getSummary(currency = 'USD'): Promise<MoneyTransparencySummary> {
        const nowMs = Date.now();
        const hit = MoneyTransparencyService.cache.get(currency);
        if (hit && nowMs < hit.expiresAtMs) {
            // تحقق الرخص: عدّ القيود الحالي مقابل المخزن. أي حركة ledger
            // جديدة (الجدول append-only) تغيّر العدّ ⇒ إبطال فوري.
            const currentCount = await this.countEntries(currency);
            if (currentCount === hit.entryCount) {
                return {
                    totalInCents: hit.totalInCents,
                    totalOutCents: hit.totalOutCents,
                    platformShareCents: hit.platformShareCents,
                    currency,
                    verifiedAt: hit.verifiedAt,
                    fingerprint: hit.fingerprint,
                    cached: true,
                };
            }
        }

        const [totalInCents, totalOutCents, platformShareCents, entryCount] = await Promise.all([
            this.sumByDirectionPattern(currency, 'credit', 'reserve:%'),
            this.sumByDirectionPattern(currency, 'debit', 'user:%'),
            this.netByPattern(currency, 'platform:%'),
            this.countEntries(currency),
        ]);

        const verifiedAt = new Date().toISOString();
        const fingerprint = fingerprintSummary({
            currency,
            totalInCents,
            totalOutCents,
            platformShareCents,
            entryCount,
        });
        MoneyTransparencyService.cache.set(currency, {
            totalInCents,
            totalOutCents,
            platformShareCents,
            verifiedAt,
            fingerprint,
            entryCount,
            expiresAtMs: nowMs + TRANSPARENCY_CACHE_TTL_MS,
        });
        return {
            totalInCents,
            totalOutCents,
            platformShareCents,
            currency,
            verifiedAt,
            fingerprint,
            cached: false,
        };
    }

    /** مجموع amount_cents لاتجاه وحسابات مطابقة (قراءة من ledger فقط). */
    private async sumByDirectionPattern(
        currency: string,
        direction: 'debit' | 'credit',
        accountLike: string
    ): Promise<number> {
        const row = await this.db
            .prepare(
                `SELECT COALESCE(SUM(amount_cents), 0) AS s
                 FROM ledger_entries
                 WHERE currency = ? AND direction = ? AND account LIKE ?`
            )
            .bind(currency, direction, accountLike)
            .first<{ s: number | null }>();
        return row?.s ?? 0;
    }

    /** صافي (مدين − دائن) لحسابات مطابقة — دلالة LedgerService.balance. */
    private async netByPattern(currency: string, accountLike: string): Promise<number> {
        const row = await this.db
            .prepare(
                `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS s
                 FROM ledger_entries
                 WHERE currency = ? AND account LIKE ?`
            )
            .bind(currency, accountLike)
            .first<{ s: number | null }>();
        return row?.s ?? 0;
    }

    private async countEntries(currency: string): Promise<number> {
        const row = await this.db
            .prepare('SELECT COUNT(*) AS c FROM ledger_entries WHERE currency = ?')
            .bind(currency)
            .first<{ c: number | null }>();
        return row?.c ?? 0;
    }
}

export default MoneyTransparencyService;
