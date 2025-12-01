-- Backup current test users (for restoration later)
-- Run this to see current users
SELECT * FROM users;

-- To restore demo users later (after deleting test accounts), use:
-- INSERT INTO users SELECT * FROM users_backup WHERE id IN (1, 2, 3);
