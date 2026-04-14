-- Task 7 & 8: Phase 2 Systems - Recommendation Engine + Competition Lifecycle

-- Task 7: user_hidden_competitions for recommendation exclusions
CREATE TABLE IF NOT EXISTS user_hidden_competitions (
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, competition_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (competition_id) REFERENCES competitions(id)
);

-- Task 7: user_keywords for recommendation topic matching (if not exists)
CREATE TABLE IF NOT EXISTS user_keywords (
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, keyword),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Task 7: Index for faster recommendation queries
CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, competition_id);
CREATE INDEX IF NOT EXISTS idx_competitions_status_language ON competitions(status, language);
CREATE INDEX IF NOT EXISTS idx_competitions_status_country ON competitions(status, country);
CREATE INDEX IF NOT EXISTS idx_competitions_status_category ON competitions(status, category_id);
CREATE INDEX IF NOT EXISTS idx_competitions_created_at ON competitions(created_at);

-- Task 8: Ensure competition_type column exists (already in 0001 but defensive)
-- The column was added in 0001_initial_schema.sql as part of the competitions table
-- This is a safety check for any existing databases that might lack it

-- Task 8: Index for lifecycle timer queries
CREATE INDEX IF NOT EXISTS idx_competitions_type_status_created ON competitions(competition_type, status, created_at);
CREATE INDEX IF NOT EXISTS idx_competitions_type_status_scheduled ON competitions(competition_type, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_competitions_status_started ON competitions(status, started_at);

-- Task 8: Ensure competition_scheduled_tasks table exists
CREATE TABLE IF NOT EXISTS competition_scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    task_type TEXT NOT NULL,
    execute_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    result_message TEXT,
    executed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_execute ON competition_scheduled_tasks(status, execute_at);
