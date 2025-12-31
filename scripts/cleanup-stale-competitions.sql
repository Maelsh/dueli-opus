-- Script: Cleanup stale live competitions
-- سكربت: تنظيف المنافسات الحية القديمة
-- يجب تشغيله يدوياً أو كـ cron job

-- 1. End all "live" competitions that started more than 2 hours ago
UPDATE competitions 
SET status = 'completed',
    stream_status = 'ready',
    ended_at = datetime('now')
WHERE status = 'live' 
AND started_at IS NOT NULL 
AND datetime(started_at, '+2 hours') < datetime('now');

-- 2. End all "live" competitions without started_at (orphaned)
UPDATE competitions 
SET status = 'completed',
    stream_status = 'ready',
    ended_at = datetime('now')
WHERE status = 'live' 
AND started_at IS NULL;

-- 3. Fix "accepted" competitions that have been waiting too long (more than 1 week)
-- These should be cancelled, not left hanging
UPDATE competitions 
SET status = 'cancelled'
WHERE status = 'accepted' 
AND created_at IS NOT NULL 
AND datetime(created_at, '+7 days') < datetime('now');

-- 4. Show current status summary
SELECT 
    status,
    stream_status,
    COUNT(*) as count
FROM competitions 
GROUP BY status, stream_status
ORDER BY status;
