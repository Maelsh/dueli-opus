-- Migration 0009: Account Deletion Support
-- أعمدة يحتاجها نظام حذف الحساب (GDPR) التي كانت وهمية في الكود

ALTER TABLE users ADD COLUMN deleted_at DATETIME;
ALTER TABLE users ADD COLUMN deletion_reason TEXT;
ALTER TABLE competitions ADD COLUMN creator_anonymized INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN user_anonymized INTEGER DEFAULT 0;
