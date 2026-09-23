-- 0029_drop_unused_posts.sql — C3b: remove dead `posts`/`post_likes` schema
--
-- Evidence (verified on origin/main 376b2ea before writing):
--   * zero code references to bare `posts` in src/tests/workers
--     (no SELECT/INSERT/UPDATE/DELETE/JOIN, no model, no route, no FK besides below)
--   * zero code references to `post_likes` in src/tests
--   * live post system is `user_posts` via UserPostModel (src/models/UserSettingsModel.ts:152,
--     tableName='user_posts'), used by SettingsController (4 call sites) + profile-page +
--     delete-account cascade; db/seed.sql touches only `user_posts`
--   * `post_likes.post_id` FK-references `posts(id)` (0001:169), so the dependent
--     must go first — both tables are dead, both are dropped, nothing else touched.
--   * `user_posts` is explicitly NOT touched by this migration.
-- Forward-only: DROP IF EXISTS, no data copy (dead tables, no readers/writers).

DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS posts;
