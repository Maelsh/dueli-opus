-- Migration 0022: Donation recipients (Task 8.E — التبرعات للمتنافسين)
--
-- الفجوة: جدول donations (من 0001) لا يعرف مستلماً — كل التبرعات كانت
-- للمنصة. 8.E تتيح للمشاهد التبرع لمتنافس معيّن (وربط التبرع بالبث الحي
-- عبر competition_id لبث حدث SSE على قناة المنافسة).
--
-- additive فقط (ALTER TABLE ADD COLUMN + فهارس) — لا إعادة بناء، لا مساس
-- بأي عمود قائم، لا تعديل لملفات الترحيل التاريخية:
-- (1) recipient_user_id: المتنافس المستلم (NULL = تبرع للمنصة كما في 8.C —
--     يبقى المسار القديم يعمل بلا تغيير).
-- (2) competition_id: سياق البث الحي (NULL = خارج البث — لا حدث SSE).
-- السلامة المرجعية: REFERENCES ... ON DELETE SET NULL (تبرع يبقى سجلاً
-- تاريخياً حتى لو حُذف المستخدم/المنافسة).

ALTER TABLE donations ADD COLUMN recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE donations ADD COLUMN competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_donations_recipient ON donations (recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_donations_competition ON donations (competition_id);
