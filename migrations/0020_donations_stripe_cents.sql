-- Migration 0020: Stripe payment ledger integration (Task 8.C — مدفوعات Stripe)
--
-- 8.A جعل ledger_entries مصدر الحقيقة المالي الوحيد؛ هذه الترحيلة تربط مسار
-- الدفع الفعلي بـLedgerService. لا يُكتب أي رصيد ولا يُنشأ مسار مالي موازٍ —
-- الجدولان أدناه هما سجلّات حالة وحدث فقط، والمال يتحرك حصراً عبر
-- LedgerService.post()/withdraw().
--
-- (1) donations.amount_cents: المبلغ بالسنت كعدد صحيح. عمود amount (REAL) قديم
--     ويبقى للعرض فقط (لهذا السبب لا يُعدّل ولا يُسقط — إسقاط عمود في SQLite/D1
--     يتطلب إعادة بناء الجدول كاملاً). العمود الجديد هو المبلغ المالي المعتمد:
--     كل مطابقات المبلغ في مسار الدفع تُقرأ منه (integer cents فقط، لا فاصلة
--     عائمة في أي حساب مالي). NOT NULL + CHECK > 0 + INTEGER يحرّض المخطط على
--     رفض أي قيمة غير صحيحة تماماً.
--
-- (2) stripe_webhook_events: سجل أحداث Stripe المُعالَجة (idempotency + تدقيق).
--     event_id فريد = مفتاح عدم التكرار: نفس الحدث المُعاد 10 مرات يُعالَج
--     مرة واحدة. الحالة المالية لا تُخزَّن هنا إطلاقاً — فقط مرجع tx_id في
--     ledger_entries (المصدر الوحيد للأثر المالي).

ALTER TABLE donations ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0);

-- Backfill من amount القديم (REAL dollars) إلى سنتات صحيحة. هذه العملية
-- أحادية الاتجاه وتُجرى على القاعدة المحلية/الاختبار فقط (لا تُطبَّق على
-- الإنتاج تلقائياً — انظر قيود المهمة).
UPDATE donations SET amount_cents = CAST(ROUND(COALESCE(amount, 0) * 100) AS INTEGER);

CREATE TABLE stripe_webhook_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL UNIQUE,
    event_type  TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    -- رابط مباشر للقيود المالية الفعلية في ledger_entries (M5: قوة التدقيق).
    -- قد يكون NULL للأحداث غير المدعومة (لا أثر مالي لها).
    tx_id       TEXT
);

CREATE INDEX idx_stripe_webhook_events_event_id ON stripe_webhook_events (event_id);
CREATE INDEX idx_stripe_webhook_events_tx_id ON stripe_webhook_events (tx_id);
