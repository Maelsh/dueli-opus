-- Script: End competition 2172 (testa) manually
-- سكربت: إنهاء منافسة 2172 يدوياً

-- تحديث حالة المنافسة 2172 إلى completed
UPDATE competitions 
SET status = 'completed',
    stream_status = 'ready',
    ended_at = datetime('now')
WHERE id = 2172;

-- التحقق من النتيجة
SELECT id, title, status, stream_status, started_at, ended_at 
FROM competitions 
WHERE id = 2172;
