-- Test Users ONLY for Streaming Test
-- مستخدمين للاختبار فقط

-- 1. Create Test Host User
INSERT OR REPLACE INTO users (
    id, username, email, password_hash, display_name, 
    country, language, avatar_url, is_active, is_verified, created_at
) VALUES (
    9001, 
    'test_host', 
    'host@test.dueli', 
    'e3481daae2aab7b69f64c0e5675ef5013a44e388c7b141b5c9e767d7e5c339e1',
    'Test Host',
    'SA',
    'ar',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=test_host',
    1,
    1,
    datetime('now')
);

-- 2. Create Test Opponent User
INSERT OR REPLACE INTO users (
    id, username, email, password_hash, display_name, 
    country, language, avatar_url, is_active, is_verified, created_at
) VALUES (
    9002, 
    'test_opponent', 
    'opponent@test.dueli', 
    '84544535492452ba49eeb0a9c7dea2b77eb69345b550c917e87fba762128ce47',
    'Test Opponent',
    'SA',
    'ar',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=test_opponent',
    1,
    1,
    datetime('now')
);

-- Verification
SELECT id, username, email, display_name FROM users WHERE id IN (9001, 9002);
