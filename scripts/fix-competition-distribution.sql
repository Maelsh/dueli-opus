-- Script: Fix competition distribution - 4 types per subcategory (CORRECT RULES)
-- سكربت: إصلاح توزيع المنافسات - القواعد الصحيحة
-- 
-- القواعد:
-- 1. pending (فوري) - بدون opponent، scheduled_at = الآن
-- 2. accepted (مجدول) - مع opponent، scheduled_at في المستقبل (1-12 شهر)
-- 3. live - مع opponent، started_at خلال آخر ساعتين، لا ended_at
-- 4. completed - مع opponent، started_at في الماضي، ended_at موجود

-- ========================================
-- الخطوة 1: إعادة كل المنافسات الوهمية إلى pending
-- ========================================
UPDATE competitions 
SET status = 'pending',
    stream_status = 'idle',
    opponent_id = NULL,
    started_at = NULL,
    ended_at = NULL,
    scheduled_at = datetime('now')
WHERE is_fake = 1;

-- ========================================
-- الخطوة 2: توزيع حسب ID
-- ID % 4 = 0 → pending فوري (بدون opponent)
-- ID % 4 = 1 → accepted مجدول (مع opponent في المستقبل)
-- ID % 4 = 2 → live (مع opponent، بدأ قبل ساعة)
-- ID % 4 = 3 → completed (مع opponent، انتهى)
-- ========================================

-- 2A. Pending فوري - ID % 4 = 0 (بقاء كما هو - بدون opponent)
-- لا حاجة للتحديث، هو بالفعل pending بدون opponent

-- 2B. Accepted مجدول - ID % 4 = 1
-- مع opponent، scheduled_at في المستقبل (1-12 شهر)
UPDATE competitions 
SET status = 'accepted',
    stream_status = 'idle',
    opponent_id = (SELECT id FROM users WHERE is_fake = 1 ORDER BY RANDOM() LIMIT 1),
    scheduled_at = datetime('now', '+' || (30 + (id % 300)) || ' days'),
    started_at = NULL,
    ended_at = NULL
WHERE is_fake = 1 AND id % 4 = 1;

-- 2C. Live - ID % 4 = 2
-- مع opponent، started_at خلال آخر ساعتين
UPDATE competitions 
SET status = 'live',
    stream_status = 'live',
    opponent_id = (SELECT id FROM users WHERE is_fake = 1 AND id != competitions.creator_id ORDER BY RANDOM() LIMIT 1),
    scheduled_at = datetime('now', '-1 hour'),
    started_at = datetime('now', '-1 hour'),
    ended_at = NULL
WHERE is_fake = 1 AND id % 4 = 2;

-- 2D. Completed - ID % 4 = 3
-- مع opponent، started_at و ended_at في الماضي
UPDATE competitions 
SET status = 'completed',
    stream_status = 'ready',
    opponent_id = (SELECT id FROM users WHERE is_fake = 1 AND id != competitions.creator_id ORDER BY RANDOM() LIMIT 1),
    scheduled_at = datetime('now', '-' || (1 + (id % 30)) || ' days'),
    started_at = datetime('now', '-' || (1 + (id % 30)) || ' days'),
    ended_at = datetime('now', '-' || (id % 30) || ' days', '-2 hours')
WHERE is_fake = 1 AND id % 4 = 3;

-- ========================================
-- عرض ملخص التوزيع
-- ========================================
SELECT 
    status,
    CASE 
        WHEN opponent_id IS NULL THEN 'بدون خصم'
        ELSE 'مع خصم'
    END as opponent_status,
    CASE 
        WHEN scheduled_at > datetime('now') THEN 'مستقبلي'
        WHEN scheduled_at <= datetime('now') THEN 'حالي/ماضي'
        ELSE 'غير محدد'
    END as schedule_type,
    COUNT(*) as count
FROM competitions
WHERE is_fake = 1
GROUP BY status, opponent_status, schedule_type
ORDER BY status;
