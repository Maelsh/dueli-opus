-- Migration 0008: Allow Requests Privacy Control
-- T2.1: السماح للمستخدم بإغلاق استلام طلبات/دعوات المنافسة

ALTER TABLE user_settings ADD COLUMN allow_requests INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_user_settings_allow_requests ON user_settings(allow_requests);
