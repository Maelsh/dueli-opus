-- Script: Make half of competitions in each subcategory "live"
-- سكربت: جعل نصف المنافسات في كل قسم فرعي "حية"
-- متوافق مع SQLite/D1

-- 1. أولاً نجعل كل المنافسات completed (ما عدا testhost/testguest)
UPDATE competitions 
SET status = 'completed', 
    stream_status = 'ready',
    ended_at = COALESCE(ended_at, datetime('now', '-1 hour'))
WHERE creator_id NOT IN (SELECT id FROM users WHERE username IN ('testhost', 'testguest'));

-- 2. نجعل المنافسات ذات الـ id الزوجي "live" (تقريباً النصف)
UPDATE competitions 
SET status = 'live',
    stream_status = 'live',
    started_at = COALESCE(started_at, datetime('now', '-30 minutes')),
    ended_at = NULL
WHERE id % 2 = 0
AND creator_id NOT IN (SELECT id FROM users WHERE username IN ('testhost', 'testguest'));

-- 3. عرض ملخص
SELECT status, stream_status, COUNT(*) as count 
FROM competitions 
GROUP BY status, stream_status;
