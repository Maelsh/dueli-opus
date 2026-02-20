/**
 * Migration Manager for D1 Database
 * مدير ترحيل قاعدة البيانات
 */
export class MigrationManager {
    constructor(private db: D1Database) {}

    /**
     * Run all pending migrations
     * تشغيل كل الترحيلات المعلقة
     */
    async migrate(): Promise<void> {
        // Ensure migrations table exists
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        // List of migrations (in order)
        const migrations: Array<{ id: number; name: string; sql: string }> = [
            {
                id: 1,
                name: '001_initial_schema',
                sql: this.getInitialSchemaMigration()
            },
            {
                id: 2,
                name: '002_add_busy_status',
                sql: this.getBusyStatusMigration()
            },
            {
                id: 3,
                name: '003_add_heartbeat_system',
                sql: this.getHeartbeatMigration()
            },
            {
                id: 4,
                name: '004_add_scheduled_tasks',
                sql: this.getScheduledTasksMigration()
            },
            {
                id: 5,
                name: '005_add_watch_history',
                sql: this.getWatchHistoryMigration()
            }
        ];

        // Run each migration
        for (const migration of migrations) {
            await this.runMigration(migration);
        }

        console.log('All migrations completed successfully');
    }

    /**
     * Run a single migration
     * تشغيل ترحيل واحد
     */
    private async runMigration(migration: { id: number; name: string; sql: string }): Promise<void> {
        // Check if migration already applied
        const exists = await this.db.prepare(
            'SELECT 1 FROM migrations WHERE id = ?'
        ).bind(migration.id).first();

        if (exists) {
            console.log(`Migration ${migration.name} already applied, skipping`);
            return;
        }

        console.log(`Running migration: ${migration.name}`);

        try {
            // Split SQL into statements and execute
            const statements = migration.sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            // Execute all statements in batch
            await this.db.batch(
                statements.map(sql => this.db.prepare(sql))
            );

            // Record migration as applied
            await this.db.prepare(
                'INSERT INTO migrations (id, name) VALUES (?, ?)'
            ).bind(migration.id, migration.name).run();

            console.log(`Migration ${migration.name} completed successfully`);
        } catch (error) {
            console.error(`Migration ${migration.name} failed:`, error);
            throw error;
        }
    }

    /**
     * Migration 001: Initial Schema
     * This is handled by schema.sql, so return empty
     */
    private getInitialSchemaMigration(): string {
        return `
            -- Initial schema is loaded from schema.sql
            -- This migration is a placeholder for tracking
            SELECT 1
        `;
    }

    /**
     * Migration 002: Add Busy Status Fields
     */
    private getBusyStatusMigration(): string {
        return `
            -- Add busy status fields to users table if not exists
            ALTER TABLE users ADD COLUMN is_busy BOOLEAN DEFAULT 0;
            ALTER TABLE users ADD COLUMN current_competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL;
            ALTER TABLE users ADD COLUMN busy_since DATETIME;
            ALTER TABLE users ADD COLUMN elo_rating INTEGER DEFAULT 1500;
            ALTER TABLE users ADD COLUMN last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP;
            
            CREATE INDEX IF NOT EXISTS idx_users_is_busy ON users(is_busy);
            CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo_rating);
            CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at)
        `;
    }

    /**
     * Migration 003: Add Heartbeat System
     */
    private getHeartbeatMigration(): string {
        return `
            CREATE TABLE IF NOT EXISTS competition_heartbeats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(competition_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_heartbeats_competition ON competition_heartbeats(competition_id);
            CREATE INDEX IF NOT EXISTS idx_heartbeats_user ON competition_heartbeats(user_id);
            CREATE INDEX IF NOT EXISTS idx_heartbeats_last_seen ON competition_heartbeats(last_seen)
        `;
    }

    /**
     * Migration 004: Add Scheduled Tasks
     */
    private getScheduledTasksMigration(): string {
        return `
            CREATE TABLE IF NOT EXISTS competition_scheduled_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
                task_type TEXT NOT NULL CHECK (task_type IN (
                    'auto_delete_if_not_live',
                    'auto_end_live',
                    'send_reminder',
                    'distribute_earnings',
                    'check_disconnection'
                )),
                execute_at DATETIME NOT NULL,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
                result_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                executed_at DATETIME
            );

            CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_execute ON competition_scheduled_tasks(execute_at, status);
            CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_competition ON competition_scheduled_tasks(competition_id)
        `;
    }

    /**
     * Migration 005: Add Watch History
     */
    private getWatchHistoryMigration(): string {
        return `
            CREATE TABLE IF NOT EXISTS watch_history (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
                watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                watch_duration_seconds INTEGER DEFAULT 0,
                completed BOOLEAN DEFAULT 0,
                PRIMARY KEY (user_id, competition_id)
            );

            CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_watch_history_watched ON watch_history(watched_at);
            CREATE INDEX IF NOT EXISTS idx_watch_history_competition ON watch_history(competition_id);

            CREATE TABLE IF NOT EXISTS user_keywords (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                keyword TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, keyword)
            );

            CREATE INDEX IF NOT EXISTS idx_keywords_user ON user_keywords(user_id);

            CREATE TABLE IF NOT EXISTS watch_later (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, competition_id)
            );

            CREATE INDEX IF NOT EXISTS idx_watch_later_user ON watch_later(user_id);
            CREATE INDEX IF NOT EXISTS idx_watch_later_added ON watch_later(added_at)
        `;
    }

    /**
     * Rollback last migration (for development only)
     * التراجع عن آخر ترحيل
     */
    async rollback(): Promise<void> {
        const lastMigration = await this.db.prepare(
            'SELECT * FROM migrations ORDER BY id DESC LIMIT 1'
        ).first();

        if (!lastMigration) {
            console.log('No migrations to rollback');
            return;
        }

        console.log(`Rolling back migration: ${lastMigration.name}`);

        // Delete the migration record
        await this.db.prepare(
            'DELETE FROM migrations WHERE id = ?'
        ).bind(lastMigration.id).run();

        console.log('Rollback completed. Note: You may need to manually drop tables/columns.');
    }
}
