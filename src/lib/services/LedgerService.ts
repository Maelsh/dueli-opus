/**
 * LedgerService — دفتر الأستاذ محاسبياً (المهمة 8.A)
 *
 * كل حركة مال لها قيدان متوازنان (debit/credit)، ومجموع النظام قابل للتحقق
 * في أي لحظة عبر verifyInvariant(). القواعد الحاكمة: docs/11 §4 (M1–M6).
 *
 * - M1: كل post() يكتب مجموعة قيود متوازنة داخل db.batch() واحد، ويُبقي
 *   Σ(debit) − Σ(credit) صفراً على مستوى النظام كله.
 * - M2: الذرّية عبر db.batch() — لا «خطوتان + rollback يدوي في catch».
 * - M3: منع السلبية بشرط SQL (INSERT شرطي يفحص الرصيد المُجمَّع) — لا فحص JS.
 * - M4: عدم التكرار عبر UNIQUE(tx_id, account) + فحص وجود مسبق — إعادة
 *   إرسال نفس العملية (نفس tx_id) لا تُنشئ قيداً ثانياً ولا ترمي خطأ.
 *   ملاحظة: لا يمكن UNIQUE(tx_id) وحده لأن الحركة الواحدة تُنتج صفّين
 *   (مدين ودائن) يحملان نفس tx_id عمداً.
 * - M5: أثر التدقيق — created_by + ref_type/ref_id لكل قيد، ولا تعديل
 *   ولا حذف (append-only مفروض بمشغلات قاعدة البيانات في 0019).
 * - لا رصيد مكرر: الرصيد تجميع مباشر من ledger فقط.
 */

/** حسابات دفتر الأستاذ المعروفة. النمط الثابت: type:scope[:id]. */
export type LedgerAccountType = 'user' | 'platform' | 'reserve';

/** اتجاه القيد. */
export type LedgerDirection = 'debit' | 'credit';

/** مرجع العملية المصدرية (polymorphic — بلا FK عمداً، نمط 0002). */
export interface LedgerRef {
    ref_type: string;
    ref_id: number | null;
}

/** قيد واحد ضمن حركة. */
export interface LedgerEntrySpec {
    /** حساب الطرف، مثل: user:17 أو platform:revenue. */
    account: string;
    /** مدين أو دائن. */
    direction: LedgerDirection;
    /** المبلغ بالسنت — عدد صحيح موجب فقط. */
    amountCents: number;
}

/** حركة كاملة: مجموعة قيود متوازنة بهوية واحدة. */
export interface LedgerTx {
    /** معرّف العملية الفريد (مفتاح عدم التكرار M4). */
    txId: string;
    /** العملة — 3 أحرف (USD...). */
    currency?: string;
    /** العملية المصدرية (تدقيق M5). */
    ref?: LedgerRef;
    /** من أنشأ هذه الحركة (تدقيق M5): user:17 / system:cron / admin:3. */
    createdBy: string;
    /** أطراف الحركة — يجب أن تتوازن في المجموع. */
    entries: LedgerEntrySpec[];
}

/** نتيجة post(). */
export interface LedgerPostResult {
    /** true ⇒ كُتبت قيود جديدة؛ false ⇒ tx مكرر فُسِر كـ no-op (M4). */
    applied: boolean;
    txId: string;
}

/** نتيجة verifyInvariant(): الفرق يجب أن يكون صفراً دائماً (M1). */
export interface LedgerInvariant {
    totalDebitCents: number;
    totalCreditCents: number;
    /** Σ(debit) − Σ(credit) — يجب أن يكون 0. أي قيمة ≠ 0 خرق للثابت. */
    difference: number;
}

export class LedgerError extends Error {
    constructor(
        public readonly code:
            | 'unbalanced'
            | 'invalid_amount'
            | 'invalid_direction'
            | 'insufficient_funds'
            | 'invalid_currency'
            | 'invalid_actor',
        message: string
    ) {
        super(message);
        this.name = 'LedgerError';
    }
}

/** نمط الحساب المسموح. */
const ACCOUNT_RE = /^(user:\d+|platform:[a-z0-9_-]+|reserve:[a-z0-9_-]+)$/;
/** نمط منشئ الحركة (تدقيق M5). */
const ACTOR_RE = /^(user:\d+|admin:\d+|system:[a-z0-9_-]+)$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const sumTotals = (rows: { total: number | null }[]): number =>
    rows.reduce<number>((acc, r) => acc + (r.total ?? 0), 0);

export class LedgerService {
    constructor(private readonly db: D1Database) {}

    /**
     * تسجيل حركة: مجموعة قيود متوازنة في db.batch() واحد (M1 + M2).
     * Idempotent (M4): نفس txId مرة ثانية ⇒ no-op بلا خطأ.
     */
    async post(tx: LedgerTx): Promise<LedgerPostResult> {
        if (!tx.txId || typeof tx.txId !== 'string') {
            throw new LedgerError('unbalanced', 'txId is required');
        }
        if (!ACTOR_RE.test(tx.createdBy)) {
            throw new LedgerError('invalid_actor', `invalid createdBy actor: ${tx.createdBy}`);
        }
        if (tx.currency !== undefined && !CURRENCY_RE.test(tx.currency)) {
            throw new LedgerError('invalid_currency', `currency must be a 3-letter code, got: ${tx.currency}`);
        }
        if (!Array.isArray(tx.entries) || tx.entries.length < 2) {
            // الحركة محاسبية: طرفان على الأقل (مدين ودائن).
            throw new LedgerError('unbalanced', 'a transaction needs at least two entries');
        }
        for (const e of tx.entries) {
            if (!ACCOUNT_RE.test(e.account)) {
                throw new LedgerError('unbalanced', `invalid account format: ${e.account}`);
            }
            if (e.direction !== 'debit' && e.direction !== 'credit') {
                throw new LedgerError('invalid_direction', `direction must be debit|credit, got: ${e.direction}`);
            }
            if (!Number.isInteger(e.amountCents) || e.amountCents <= 0) {
                throw new LedgerError('invalid_amount', `amountCents must be a positive integer, got: ${e.amountCents}`);
            }
        }
        const totalDebit = tx.entries
            .filter((e) => e.direction === 'debit')
            .reduce((a, e) => a + e.amountCents, 0);
        const totalCredit = tx.entries
            .filter((e) => e.direction === 'credit')
            .reduce((a, e) => a + e.amountCents, 0);
        if (totalDebit !== totalCredit) {
            throw new LedgerError('unbalanced', `unbalanced transaction: debit ${totalDebit} ≠ credit ${totalCredit}`);
        }

        const currency = tx.currency ?? 'USD';
        const refType = tx.ref?.ref_type ?? null;
        const refId = tx.ref?.ref_id ?? null;

        // M4: فحص عدم التكرار قبل الكتابة (هادئ — no-op، لا خطأ).
        const existing = await this.db
            .prepare('SELECT tx_id FROM ledger_entries WHERE tx_id = ? LIMIT 1')
            .bind(tx.txId)
            .first<{ tx_id: string }>();
        if (existing) {
            return { applied: false, txId: tx.txId };
        }

        // M2: كل القيود في batch واحد — ذرّية بلا rollback يدوي.
        const stmts = tx.entries.map((e) =>
            this.db
                .prepare(
                    `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(tx.txId, e.account, e.direction, e.amountCents, currency, refType, refId, tx.createdBy)
        );
        await this.db.batch(stmts);
        return { applied: true, txId: tx.txId };
    }

    /**
     * سحب من حساب مستخدم إلى حساب المنصة (تطبيق ملموس على M3).
     * الرصيد يُفحص بشرط SQL داخل عبارة INSERT شرطية — لا فحص JS:
     * إن لم يكفِ الرصيد المُجمَّع فإن INSERT ... SELECT يرفض إدراج الصف
     * (0 صفوف) — وهذا رفض العملية، والفحص والكتابة في نفس العبارة فلا
     * TOCTOU ولا فجوة سباق.
     */
    async withdraw(params: {
        userId: number;
        amountCents: number;
        currency?: string;
        txId: string;
        createdBy: string;
        ref?: LedgerRef;
    }): Promise<LedgerPostResult> {
        if (!Number.isInteger(params.userId) || params.userId <= 0) {
            throw new LedgerError('invalid_amount', 'userId must be a positive integer');
        }
        if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
            throw new LedgerError('invalid_amount', `amountCents must be a positive integer, got: ${params.amountCents}`);
        }
        if (params.currency !== undefined && !CURRENCY_RE.test(params.currency)) {
            throw new LedgerError('invalid_currency', `currency must be a 3-letter code, got: ${params.currency}`);
        }
        if (!ACTOR_RE.test(params.createdBy)) {
            throw new LedgerError('invalid_actor', `invalid createdBy actor: ${params.createdBy}`);
        }

        // M4: إعادة الإرسال ⇒ no-op بلا إنشاء قيد ثانٍ.
        const existing = await this.db
            .prepare('SELECT tx_id FROM ledger_entries WHERE tx_id = ? LIMIT 1')
            .bind(params.txId)
            .first<{ tx_id: string }>();
        if (existing) {
            return { applied: false, txId: params.txId };
        }

        const userAccount = `user:${params.userId}`;
        const currency = params.currency ?? 'USD';
        const refType = params.ref?.ref_type ?? 'withdrawal';
        const refId = params.ref?.ref_id ?? null;

        // M3 + M2: الفحص والكتابة في عبارتين مشروطتين داخل batch واحد.
        // القيد الأول (دائن للمنصة) يُدرج فقط حين رصيد المستخدم المُجمَّع ≥
        // المبلغ؛ القيد الثاني (مدين للمستخدم) يُدرج فقط حين tx_id موجود —
        // أي فقط عندما نجح الأول. إن فشل الشرط فلا يُدرج أي صف ⇒ رفض.
        const stmts = [
            this.db
                .prepare(
                    `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                     SELECT ?, 'platform:withdrawals', 'debit', ?, ?, ?, ?, ?
                     WHERE (
                         SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                         FROM ledger_entries
                         WHERE account = ?
                     ) >= ?`
                )
                .bind(params.txId, params.amountCents, currency, refType, refId, params.createdBy, userAccount, params.amountCents),
            this.db
                .prepare(
                    `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                     SELECT ?, ?, 'credit', ?, ?, ?, ?, ?
                     WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE tx_id = ?)`
                )
                .bind(params.txId, userAccount, params.amountCents, currency, refType, refId, params.createdBy, params.txId),
        ];
        const results = await this.db.batch(stmts);
        const inserted = results.reduce<number>(
            (acc, r) => acc + ((r.meta as { changes?: number } | undefined)?.changes ?? 0),
            0
        );
        if (inserted === 0) {
            throw new LedgerError('insufficient_funds', 'insufficient funds for withdrawal');
        }
        return { applied: true, txId: params.txId };
    }

    /** رصيد حساب واحد = تجميع مباشر من ledger (لا عمود مكرر). */
    async balance(account: string, currency = 'USD'): Promise<number> {
        if (!ACCOUNT_RE.test(account)) {
            throw new LedgerError('unbalanced', `invalid account format: ${account}`);
        }
        const row = await this.db
            .prepare(
                `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS total
                 FROM ledger_entries
                 WHERE account = ? AND currency = ?`
            )
            .bind(account, currency)
            .first<{ total: number | null }>();
        return row?.total ?? 0;
    }

    /**
     * الثابت المحاسبي (M1): يُعاد الفرق Σ(debit) − Σ(credit)،
     * ويجب أن يكون صفراً دائماً.
     */
    async verifyInvariant(currency = 'USD'): Promise<LedgerInvariant> {
        const res = await this.db
            .prepare(
                `SELECT direction, COALESCE(SUM(amount_cents), 0) AS total
                 FROM ledger_entries
                 WHERE currency = ?
                 GROUP BY direction`
            )
            .bind(currency)
            .all<{ direction: LedgerDirection; total: number | null }>();
        const totalDebit = sumTotals(res.results.filter((r) => r.direction === 'debit'));
        const totalCredit = sumTotals(res.results.filter((r) => r.direction === 'credit'));
        return {
            totalDebitCents: totalDebit,
            totalCreditCents: totalCredit,
            difference: totalDebit - totalCredit,
        };
    }

    /** قيود حركة واحدة (للتدقيق M5). */
    async entriesForTx(txId: string): Promise<Array<Record<string, unknown>>> {
        const res = await this.db
            .prepare('SELECT * FROM ledger_entries WHERE tx_id = ? ORDER BY id')
            .bind(txId)
            .all();
        return res.results;
    }
}
