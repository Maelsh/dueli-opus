-- Migration 0007: Schema Alignment
-- مواءمة المخطط مع ما يستخدمه الكود فعلياً
-- يعالج: أعمدة ELO والفائز والتقييم المفقودة + نظام نبضات المنافسة

-- 1. users.elo_rating (EloRatingService.ts يعتمد عليه)
ALTER TABLE users ADD COLUMN elo_rating INTEGER DEFAULT 1500;
CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating);

-- 2. users.current_competition_id / busy_since (ScheduledTaskService.ts)
ALTER TABLE users ADD COLUMN current_competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN busy_since DATETIME;

-- 3. competitions.winner_id + average_rating (تحديد المنتصر من التقييمات - T1.5)
ALTER TABLE competitions ADD COLUMN winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE competitions ADD COLUMN average_rating REAL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_competitions_winner ON competitions(winner_id);

-- 4. جدول نبضات المنافسة (مراقبة الحضور أثناء البث)
CREATE TABLE IF NOT EXISTS competition_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_competition ON competition_heartbeats(competition_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_user ON competition_heartbeats(user_id);
