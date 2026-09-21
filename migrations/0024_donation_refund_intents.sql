-- Migration 0024: Donation refund intents (Task 8.G — F1+F2 crash/race fix)
--
-- الفجوة المثبتة خارجياً (8.G NO-GO):
--  F1: حجز refunded_cents ثم crash قبل ledger.post() ⇒ ضياع الاسترداد
--      (إعادة إرسال Stripe ترى incremental=0 فتُسجَّل بلا أثر مالي).
--  F2: طلبان متزامنان يقرآن نفس refunded_cents القديم فيطبّقان دلتا
--      مكررة (500 بدل 300) — SELECT-then-UPDATE عارٍ.
--
-- additive فقط: جدول واحد `donation_refund_intents` — سجل نوايا استرداد
-- قابل للاسترداد (recoverable pending-refund state):
--  - يُكتب ذرياً مع تقدّم الحارس التراكمي (نفس db.batch واحد) فلا يوجد
--    crash window بين الحجز والنية: إما كلاهما أو لا شيء.
--  - يحمل القيود الدقيقة (entries_json) وtx_id الحتمي، فإعادة الإرسال أو
--    reconciliation تكمل الأثر نفسه تماماً — لا ضياع ولا تكرار (حارس
--    UNIQUE(tx_id, account) في ledger يمنع التكرار).
--  - المطالبة نفسها CAS على القيمة المتوقعة (refunded_cents = ?) فيُسرلَز
--    التزامن: الخاسر يعيد القراءة الطازجة ويعيد الحساب، لا دلتا قديمة.
--
-- الحقيقة المالية تبقى في ledger_entries حصراً (المصدر الوحيد)؛ هذا الجدول
-- سجل حالة/تدقيق فقط (لا أعمدة مالية تُستهلك كرصيد). لا مساس بأي عمود قائم
-- ولا بملفات الترحيل التاريخية.

CREATE TABLE donation_refund_intents (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    donation_id       INTEGER NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
    cumulative_cents  INTEGER NOT NULL CHECK (cumulative_cents >= 0),
    incremental_cents INTEGER NOT NULL CHECK (incremental_cents > 0),
    event_id          TEXT NOT NULL UNIQUE,
    tx_id             TEXT NOT NULL UNIQUE,
    -- القيود الدقيقة لهذا الاسترداد (JSON من StripeWebhookService) — تُعاد
    -- كتابتها حرفياً عند الاسترداد بعد الانهيار (exactly-once بنفس المحتوى).
    entries_json      TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'applied')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    applied_at        TEXT,
    -- نقطة تفتيش واحدة = نية واحدة: حدثان مختلفان بنفس التراكمي تحت
    -- التزامن لا ينتجان دلتا مكررة (الفائز الأول يثبّت النقطة، والثاني
    -- يفشل UNIQUE فيعيد القراءة الطازجة فيرى incremental<=0).
    UNIQUE (donation_id, cumulative_cents)
);

CREATE INDEX IF NOT EXISTS idx_donation_refund_intents_donation
    ON donation_refund_intents (donation_id, status);
CREATE INDEX IF NOT EXISTS idx_donation_refund_intents_event
    ON donation_refund_intents (event_id);
CREATE INDEX IF NOT EXISTS idx_donation_refund_intents_tx
    ON donation_refund_intents (tx_id);
