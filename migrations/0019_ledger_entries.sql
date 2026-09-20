-- Migration 0019: ledger_entries (Task 8.A — دفتر الأستاذ المحاسبي)
-- كل حركة مال = قيدان متوازنان (debit/credit) في دفتر واحد.
--
-- القواعد المحاسبية الحاكمة (docs/11 §4):
--   M1: مجموع النظام قابل للتحقق — Σ(debit) − Σ(credit) = 0 دائماً (LedgerService.verifyInvariant()).
--   M2: كل حركة تُكتب داخل db.batch() واحد — لا «خطوتان + rollback يدوي».
--   M3: منع السلبية بشرط SQL (INSERT شرطي يفحص الرصيد المُجمَّع) — لا فحص JS.
--   M4: عدم التكرار — UNIQUE(tx_id, account): إعادة إرسال نفس tx لا تُنشئ قيداً ثانياً.
--       ملاحظة هندسية: لا يمكن UNIQUE(tx_id) وحده لأن الحركة الواحدة تُنتج صفّين
--       (مدين ودائن) يحملان نفس tx_id عمداً؛ (tx_id, account) يمنع تكرار نفس
--       الحساب داخل نفس tx، وهذا يحقق ضمانة عدم التكرار نفسها.
--   M5: أثر تدقيق — created_by + ref لكل قيد، ولا تعديل ولا حذف (append-only
--       عبر TRIGGER RAISE(ABORT) أدناه).
--
-- الرصيد ليس عموداً مكرراً: الرصيد = تجميع من ledger فقط
-- (Σ debit − Σ credit لكل account) عبر LedgerService.balance().
--
-- لا FOREIGN KEY على (ref_type, ref_id) عمداً: مرجع متعدد الأنواع
-- (polymorphic — competition/donation/withdrawal)، نفس نمط
-- platform_financial_logs في 0002. لا أعمدة REAL/FLOAT إطلاقاً.

CREATE TABLE ledger_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id        TEXT NOT NULL,
    account      TEXT NOT NULL,
    direction    TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency     TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
    ref_type     TEXT,
    ref_id       INTEGER,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    created_by   TEXT NOT NULL,
    UNIQUE (tx_id, account)
);

CREATE INDEX idx_ledger_entries_account ON ledger_entries (account, direction);
CREATE INDEX idx_ledger_entries_tx_id   ON ledger_entries (tx_id);
CREATE INDEX idx_ledger_entries_ref     ON ledger_entries (ref_type, ref_id);

-- Append-only (M5): لا UPDATE ولا DELETE على قيد — حرفياً في محرك القاعدة.
CREATE TRIGGER trg_ledger_entries_append_only_update
BEFORE UPDATE ON ledger_entries
BEGIN
    SELECT RAISE(ABORT, 'ledger_entries is append-only: UPDATE denied');
END;

CREATE TRIGGER trg_ledger_entries_append_only_delete
BEFORE DELETE ON ledger_entries
BEGIN
    SELECT RAISE(ABORT, 'ledger_entries is append-only: DELETE denied');
END;