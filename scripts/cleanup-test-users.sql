-- Delete test users (keeps demo/original users safe)
-- This will be used when you need to clean up after testing

-- Option 1: Delete by specific email (safest)
-- DELETE FROM users WHERE email = 'your-test-email@example.com';

-- Option 2: Delete all users except original demo ones (IDs 1, 2, 3)
-- DELETE FROM users WHERE id > 3;

-- Option 3: Delete users created after a specific date
-- DELETE FROM users WHERE created_at > '2025-12-01 00:00:00';

-- Check users before deleting
SELECT id, name, email, created_at FROM users ORDER BY id;
