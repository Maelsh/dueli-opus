-- Migration 0018: competitions.elo_applied_at (B12)
-- علامة داخل قاعدة البيانات تضمن تطبيق ELO مرة واحدة فقط لكل منافسة.
-- الكتابة تتم عبر UPDATE مشروط: WHERE elo_applied_at IS NULL — فأي
-- استدعاء متزامن/متكرر يجد العمود معبأً ويُسقط كتابة ELO الذرّية.

ALTER TABLE competitions ADD COLUMN elo_applied_at TEXT;
