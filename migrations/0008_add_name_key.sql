-- Migration 0008: Add name_key to categories
-- إضافة مفتاح الاسم للأقسام
-- Date: 2025-12-13

ALTER TABLE categories ADD COLUMN name_key TEXT;
CREATE INDEX IF NOT EXISTS idx_categories_name_key ON categories(name_key);
