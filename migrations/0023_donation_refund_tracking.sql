-- Migration 0023: Donation refund tracking (Task 8.E — تصحيح REMOTE)
--
-- الفجوة المثبتة خارجياً: عدة partial refunds لنفس التبرع يمكن أن تتجاوز
-- إجمالي التبرع (كل refund يُقارَن منفرداً بالمبلغ الأصلي)، فينشأ إسراف
-- مالي رغم بقاء الثابت متوازناً.
--
-- additive فقط: عمود واحد `refunded_cents` (المبلغ المسترد المعتمد تراكمياً
-- بالسنت) — يُحجَز ذرياً عبر UPDATE مشروط واحد:
--   UPDATE donations SET refunded_cents = refunded_cents + R
--   WHERE id = ? AND refunded_cents + R <= amount_cents
-- (نفس عقيدة حراسة SQL في B5-1/B12 وM3) — فلا يمكن لمجموع الاستردادات أن
-- يتجاوز الأصل حتى تحت التزامن. القراءة المالية التفصيلية تبقى في ledger
-- (مصدر الحقيقة)؛ العمود حارس حجز فقط. لا مساس بأي عمود قائم ولا بملفات
-- الترحيل التاريخية.

ALTER TABLE donations ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0);
