-- Migration 0006: Create indexes for new feature tables
-- إنشاء الفهارس للجداول الجديدة

CREATE INDEX IF NOT EXISTS idx_likes_competition ON likes(competition_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_ads_active ON advertisements(is_active);
CREATE INDEX IF NOT EXISTS idx_impressions_ad ON ad_impressions(ad_id);
CREATE INDEX IF NOT EXISTS idx_impressions_competition ON ad_impressions(competition_id);
CREATE INDEX IF NOT EXISTS idx_earnings_user ON user_earnings(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_status ON user_earnings(status);
CREATE INDEX IF NOT EXISTS idx_posts_user ON user_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON competition_reminders(user_id);
