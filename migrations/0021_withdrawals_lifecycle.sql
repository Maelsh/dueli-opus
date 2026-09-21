-- Migration 0021: Withdrawal lifecycle (Task 8.D — السحوبات)
--
-- دورة الحياة المطلوبة: requested → approved → paid | rejected
-- مخطط 0001 كان يقيّد status بـ ('pending','processing','completed','rejected')
-- وSQLite لا يعدّل CHECK على جدول قائم، لذا يُعاد بناء الجدول (النمط القياسي:
-- إنشاء جديد + نسخ + إسقاط + إعادة تسمية). لا تُلمس ملفات الترحيل التاريخية.
--
-- (1) حالات دورة الحياة الجديدة محروسة بـ CHECK في المخطط نفسه، والانتقالات
--     محروسة في SQL داخل WithdrawalRequestModel (UPDATE مشروط + changes===1 —
--     نفس نمط حراسة الحالات B5-1/B12).
-- (2) amount_cents: المبلغ المالي المعتمد بالسنت كعدد صحيح (لا REAL في مسار
--     المال — نفس نمط 0020 للتبرعات). عمود amount (REAL) القديم يبقى للعرض فقط.
-- (3) fee_cents: صفر دائماً — لا توجد سياسة رسوم سحب في المشروع إطلاقاً
--     (لا مفتاح في platform_settings ولا كود)، فلا تُخترع سياسة مالية جديدة.
-- (4) hold_tx_id: معرّف حركة الحجز في ledger_entries (تدقيق M5 + عدم تكرار M4).
--     الحجز نفسه يتم عبر LedgerService.withdraw() فقط — لا رصيد مباشر.
--
-- تعيين الحالات القديمة → الجديدة عند النسخ:
--   pending → requested | processing → approved | completed → paid | rejected → rejected

CREATE TABLE withdrawal_requests_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'approved', 'paid', 'rejected')),
    payment_method TEXT NOT NULL,
    payment_details TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    transaction_id TEXT,
    approved_by INTEGER REFERENCES users(id),
    admin_note TEXT,
    hold_tx_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO withdrawal_requests_new
    (id, user_id, amount, amount_cents, fee_cents, status, payment_method,
     payment_details, created_at, processed_at, transaction_id, approved_by, admin_note)
SELECT
    id,
    user_id,
    amount,
    CAST(ROUND(COALESCE(amount, 0) * 100) AS INTEGER),
    0,
    CASE status
        WHEN 'pending'    THEN 'requested'
        WHEN 'processing' THEN 'approved'
        WHEN 'completed'  THEN 'paid'
        ELSE 'rejected'
    END,
    payment_method,
    payment_details,
    created_at,
    processed_at,
    transaction_id,
    approved_by,
    admin_note
FROM withdrawal_requests;

DROP TABLE withdrawal_requests;

ALTER TABLE withdrawal_requests_new RENAME TO withdrawal_requests;

CREATE INDEX IF NOT EXISTS idx_wr_status        ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_wr_user_created  ON withdrawal_requests(user_id, created_at DESC);
