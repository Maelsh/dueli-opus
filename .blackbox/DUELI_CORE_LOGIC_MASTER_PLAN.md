# 🎯 خطة المنطق الأساسي لمنصة ديولي – النسخة الكاملة
# Dueli Core Logic Master Plan

> **"خطة شاملة لإكمال منطق المنصة من الألف إلى الياء"**

---

## 📋 ملخص المطلوب (Executive Summary)

المستخدم يريد **إكمال المنطق الأساسي للمنصة** قبل أي شيء آخر. المشاكل الرئيسية:

| # | المشكلة | الحالة الحالية | المطلوب |
|---|---------|----------------|---------|
| 1 | عرض المتنافسين | ❌ غير موجود | ✅ عرض قائمة للاختيار |
| 2 | الإشعارات الفورية | ❌ تحتاج refresh | ✅ WebSocket/SSE |
| 3 | منع خلط المنافسات | ❌ غير موجود | ✅ نظام حالات صارم |
| 4 | منع التعارض | ❌ غير موجود | ✅ validation قبل كل action |

---

## 🔴 القسم الأول: منع الكوارث (Disaster Prevention)

### 1.1 قائمة المحاذير الكاملة (Complete Risk List)

| # | المخاطر | مستوى الخطورة | الحل المقترح |
|---|---------|---------------|--------------|
| 1 | **مشاركة متنافس في أكثر من منافسة** | 🔴 حرج | حالة `is_busy` + check قبل البث |
| 2 | **هجر المتنافس لمنافساته** | 🔴 حرج | Cron job يحذف بعد 1 ساعة |
| 3 | **استمرار المنافسة بعد انقطاع بث** | 🔴 حرج | Heartbeat check كل 30 ثانية |
| 4 | **قبول أكثر من طلب للمنافسة الواحدة** | 🔴 حرج | `FOR UPDATE` lock في DB |
| 5 | **طلبات معلقة للأبد** | 🟡 مهم | TTL (Time To Live) 24 ساعة |
| 6 | **إشعارات معلقة للأبد** | 🟡 مهم | Cron job شهري للحذف |
| 7 | **مستخدم غير نشط منذ سنة** | 🟢 منخفض | Cron job سنوي للحذف |
| 8 | **تضارب المواعيد (المجدولة)** | 🔴 حرج | Check قبل قبول كل طلب |
| 9 | **انتحال شخصية في البث** | 🔴 حرج | Token validation + fingerprint |
| 10 | **تزوير التقييمات** | 🟡 مهم | Rate limit + IP check |
| 11 | **فقدان chunks أثناء الرفع** | 🟡 مهم | Retry queue + checksum |
| 12 | **امتلاء storage بالملفات المؤقتة** | 🟡 مهم | Cleanup بعد الدمج مباشرة |
| 13 | **سبام الطلبات** | 🟡 مهم | Rate limit 3 طلبات/ساعة |
| 14 | **حظر غير فعال** | 🟡 مهم | Check في كل interaction |
| 15 | **تسرب بيانات المستخدمين** | 🔴 حرج | Encryption + access logs |

---

## 🛡️ القسم الثاني: الحلول المقترحة (Proposed Solutions)

### 2.1 حلول المستخدم + تحسيناتي

#### ✅ الحل 1: حذف الإشعارات القديمة (شهرياً)
```typescript
// Cron Job - كل شهر
async function cleanupOldNotifications() {
    await db.prepare(`
        DELETE FROM notifications 
        WHERE created_at < datetime('now', '-30 days')
        AND is_read = 1
    `).run();
    
    // تسجيل العملية
    await Logger.info('Deleted old notifications', { 
        deleted_count: result.meta.changes 
    });
}
```
**✅ صحيح – يحتاج فقط إضافة index على `created_at`**

---

#### ✅ الحل 2: حذف المستخدمين غير النشطين (سنوياً)
```typescript
// Cron Job - كل سنة
async function cleanupInactiveUsers() {
    const inactiveUsers = await db.prepare(`
        SELECT u.id FROM users u
        LEFT JOIN competitions c ON (c.creator_id = u.id OR c.opponent_id = u.id)
        WHERE c.id IS NULL  -- لم يشارك في أي منافسة
        AND u.last_active_at < datetime('now', '-1 year')
        AND u.role = 'user'  -- لا تحذف المشرفين
    `).all();
    
    for (const user of inactiveUsers.results) {
        // حذف متتالي
        await db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').bind(user.id, user.id).run();
        await db.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    }
}
```
**⚠️ يحتاج تحسين:** أضف `is_content_creator` flag لتجنب حذف المشاهدين النشطين (اللي بيتفرجوا كتير)

---

#### ✅ الحل 3: حذف متتالي (Cascade Delete)
```sql
-- في schema.sql
CREATE TABLE competitions (
    id INTEGER PRIMARY KEY,
    -- ... fields
);

CREATE TABLE competition_requests (
    id INTEGER PRIMARY KEY,
    competition_id INTEGER NOT NULL,
    -- ... fields
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    reference_type TEXT,
    reference_id INTEGER,
    -- ... fields
);
```

**⚠️ ملاحظة:** SQLite في D1 يدعم CASCADE لكن يجب تفعيله:
```sql
PRAGMA foreign_keys = ON;
```

---

#### ✅ الحل 4: قيود صارمة على الطلبات (Strict Request Rules)

```typescript
class CompetitionRequestController {
    
    // قبل إنشاء أي طلب
    async validateBeforeCreate(competitionId: number, requesterId: number): Promise<void> {
        const competition = await this.getCompetition(competitionId);
        
        // 1. المنافسة يجب أن تكون لاحقة (pending)
        if (competition.status !== 'pending') {
            throw new Error('المنافسة ليست متاحة للانضمام');
        }
        
        // 2. لا يمكن أن يكون لها أكثر من متنافسين
        if (competition.opponent_id) {
            throw new Error('المنافسة مكتملة (فائها متنافسين)');
        }
        
        // 3. التحقق من عدم وجود طلب معلق من نفس الشخص
        const existing = await db.prepare(`
            SELECT 1 FROM competition_requests 
            WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
        `).bind(competitionId, requesterId).first();
        
        if (existing) {
            throw new Error('لديك طلب معلق بالفعل');
        }
        
        // 4. التحقق من عدم وجود تعارض زمني (للمنافسات المجدولة)
        if (competition.scheduled_at) {
            const hasConflict = await this.checkTimeConflict(requesterId, competition.scheduled_at);
            if (hasConflict) {
                throw new Error('لديك منافسة أخرى في نفس الوقت');
            }
        }
        
        // 5. التحقق من عدم وجود حظر
        const isBlocked = await this.checkBlock(competition.creator_id, requesterId);
        if (isBlocked) {
            throw new Error('لا يمكنك إرسال طلب لهذا المستخدم');
        }
    }
    
    // عند قبول الطلب (مع Lock لمنع التعارض)
    async acceptRequest(requestId: number, creatorId: number): Promise<void> {
        // 🔴 مهم: استخدام transaction مع lock
        await db.prepare('BEGIN IMMEDIATE').run();
        
        try {
            const request = await db.prepare(`
                SELECT * FROM competition_requests WHERE id = ?
            `).bind(requestId).first();
            
            // التحقق مرة أخرى أن المنافسة ليس بها خصم
            const competition = await db.prepare(`
                SELECT opponent_id FROM competitions WHERE id = ?
            `).bind(request.competition_id).first();
            
            if (competition.opponent_id) {
                throw new Error('تم قبول متنافس آخر بالفعل');
            }
            
            // تحديث المنافسة
            await db.prepare(`
                UPDATE competitions 
                SET opponent_id = ?, status = 'accepted'
                WHERE id = ?
            `).bind(request.requester_id, request.competition_id).run();
            
            // حذف الطلبات الأخرى (الطلبات المتنافسة)
            await db.prepare(`
                DELETE FROM competition_requests 
                WHERE competition_id = ? AND id != ?
            `).bind(request.competition_id, requestId).run();
            
            // تحديث حالة الطلب المقبول
            await db.prepare(`
                UPDATE competition_requests SET status = 'accepted' WHERE id = ?
            `).bind(requestId).run();
            
            await db.prepare('COMMIT').run();
            
        } catch (error) {
            await db.prepare('ROLLBACK').run();
            throw error;
        }
    }
}
```

---

#### ✅ الحل 5: المنافسة المكتملة لا تتغير (Immutable After Acceptance)

```typescript
// في CompetitionController
async updateCompetition(c: AppContext): Promise<Response> {
    const { id } = c.req.param();
    const updates = await c.req.json();
    
    const competition = await this.getCompetition(id);
    
    // ✅ منع أي تعديل بعد قبول الخصم
    if (competition.opponent_id && competition.status !== 'pending') {
        const allowedFields = ['title', 'description', 'rules']; // فقط هذه مسموح بتعديلها
        
        for (const key of Object.keys(updates)) {
            if (!allowedFields.includes(key)) {
                return c.json({ 
                    error: 'لا يمكن تعديل هذا الحقل بعد قبول المتنافس' 
                }, 403);
            }
        }
    }
    
    // ... continue with update
}
```

---

#### ✅ الحل 6: الحذف المتبادل + الحظر (Mutual Delete + Block)

```typescript
class BlockController {
    
    // حظر مستخدم
    async blockUser(blockerId: number, blockedId: number): Promise<void> {
        await db.prepare(`
            INSERT INTO user_blocks (blocker_id, blocked_id, created_at)
            VALUES (?, ?, datetime('now'))
        `).bind(blockerId, blockedId).run();
        
        // حذف أي طلبات متبادلة
        await db.prepare(`
            DELETE FROM competition_requests 
            WHERE (requester_id = ? AND competition_id IN (
                SELECT id FROM competitions WHERE creator_id = ?
            )) OR (requester_id = ? AND competition_id IN (
                SELECT id FROM competitions WHERE creator_id = ?
            ))
        `).bind(blockerId, blockedId, blockedId, blockerId).run();
    }
    
    // التحقق من الحظر في كل interaction
    async isBlocked(user1Id: number, user2Id: number): Promise<boolean> {
        const block = await db.prepare(`
            SELECT 1 FROM user_blocks 
            WHERE (blocker_id = ? AND blocked_id = ?)
            OR (blocker_id = ? AND blocked_id = ?)
        `).bind(user1Id, user2Id, user2Id, user1Id).first();
        
        return block !== null;
    }
}
```

---

#### ✅ الحل 7: المنافسة اللاحقة – العد التنازلي + الحذف التلقائي

```typescript
// في CompetitionController أو Cron Job
class CompetitionLifecycleManager {
    
    // عند إنشاء منافسة لاحقة – إنشاء مؤقت للحذف
    async scheduleCompetitionExpiry(competitionId: number, scheduledAt: string): Promise<void> {
        // حساب وقت الحذف (موعد البدء + 1 ساعة)
        const expiryTime = new Date(scheduledAt);
        expiryTime.setHours(expiryTime.getHours() + 1);
        
        // تخزين في جدول منفصل أو metadata
        await db.prepare(`
            INSERT INTO competition_scheduled_tasks 
            (competition_id, task_type, execute_at, created_at)
            VALUES (?, 'auto_delete_if_not_live', ?, datetime('now'))
        `).bind(competitionId, expiryTime.toISOString()).run();
    }
    
    // Cron Job يعمل كل دقيقة
    async processScheduledTasks(): Promise<void> {
        const tasks = await db.prepare(`
            SELECT * FROM competition_scheduled_tasks 
            WHERE execute_at <= datetime('now') 
            AND status = 'pending'
        `).all();
        
        for (const task of tasks.results) {
            const competition = await this.getCompetition(task.competition_id);
            
            // إذا لم تتحول للحية، احذفها
            if (competition.status !== 'live') {
                await this.deleteCompetitionWithNotification(
                    task.competition_id, 
                    'تم إلغاء المنافسة لعدم بدء البث في الوقت المحدد'
                );
            }
            
            // تحديث حالة المهمة
            await db.prepare(`
                UPDATE competition_scheduled_tasks 
                SET status = 'completed' WHERE id = ?
            `).bind(task.id).run();
        }
    }
    
    // العد التنازلي في الـ Client
    getCountdownHTML(competition: Competition): string {
        if (competition.status !== 'upcoming') return '';
        
        const expiryTime = new Date(competition.scheduled_at);
        expiryTime.setHours(expiryTime.getHours() + 1);
        
        return `
            <div class="countdown-timer" data-expiry="${expiryTime.toISOString()}">
                <span class="label">سيتم إلغاء المنافسة بعد:</span>
                <span class="timer">--:--:--</span>
            </div>
            <script>
                // JavaScript للعد التنازلي
                const timer = document.querySelector('.countdown-timer');
                const expiry = new Date(timer.dataset.expiry);
                
                setInterval(() => {
                    const now = new Date();
                    const diff = expiry - now;
                    
                    if (diff <= 0) {
                        window.location.href = '/'; // تحويل للرئيسية
                        return;
                    }
                    
                    const hours = Math.floor(diff / 3600000);
                    const minutes = Math.floor((diff % 3600000) / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    
                    timer.querySelector('.timer').textContent = 
                        \`\${hours}:\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
                }, 1000);
            </script>
        `;
    }
}
```

---

#### ✅ الحل 8: المنافسة الحية – حد 2 ساعات + عد تنازلي

```typescript
class LiveCompetitionManager {
    
    // عند بدء البث
    async startLive(competitionId: number, userId: number): Promise<void> {
        // ... الكود الحالي ...
        
        // إنشاء مؤقت للإنهاء بعد 2 ساعات
        const endTime = new Date();
        endTime.setHours(endTime.getHours() + 2);
        
        await db.prepare(`
            INSERT INTO competition_scheduled_tasks 
            (competition_id, task_type, execute_at, created_at)
            VALUES (?, 'auto_end_live', ?, datetime('now'))
        `).bind(competitionId, endTime.toISOString()).run();
    }
    
    // Cron Job للإنهاء التلقائي
    async autoEndLiveCompetitions(): Promise<void> {
        const tasks = await db.prepare(`
            SELECT c.* FROM competition_scheduled_tasks t
            JOIN competitions c ON t.competition_id = c.id
            WHERE t.task_type = 'auto_end_live'
            AND t.execute_at <= datetime('now')
            AND t.status = 'pending'
            AND c.status = 'live'
        `).all();
        
        for (const competition of tasks.results) {
            await this.endCompetition(competition.id, 'auto_time_limit');
            
            // إشعار للمتنافسين
            await this.notifyCompetitors(competition.id, 
                'تم إنهاء المنافسة تلقائياً لانتهاء الوقت المحدد (ساعتين)');
        }
    }
    
    // العد التنازلي في الـ Client
    getLiveCountdownHTML(startedAt: string): string {
        const endTime = new Date(startedAt);
        endTime.setHours(endTime.getHours() + 2);
        
        return `
            <div class="live-timer" data-end="${endTime.toISOString()}">
                <span class="live-badge">🔴 LIVE</span>
                <span class="remaining">الوقت المتبقي: <span class="time">--:--</span></span>
            </div>
        `;
    }
}
```

---

#### ✅ الحل 9: حالة "مشغول" (Busy Status) – القلب النابض للمنصة

```typescript
class UserStatusManager {
    
    // تحديث الحالة عند بدء البث
    async setBusy(userId: number, competitionId: number): Promise<void> {
        await db.prepare(`
            UPDATE users 
            SET is_busy = 1, 
                current_competition_id = ?,
                busy_since = datetime('now')
            WHERE id = ?
        `).bind(competitionId, userId).run();
        
        // إشعار للمتابعين
        await this.notifyFollowers(userId, 'بدأ بث مباشر');
    }
    
    // تحرير الحالة
    async setFree(userId: number): Promise<void> {
        await db.prepare(`
            UPDATE users 
            SET is_busy = 0, 
                current_competition_id = NULL,
                busy_since = NULL
            WHERE id = ?
        `).bind(userId).run();
    }
    
    // التحقق قبل أي action
    async checkAvailability(userId: number): Promise<AvailabilityResult> {
        const user = await db.prepare(`
            SELECT is_busy, current_competition_id, busy_since 
            FROM users WHERE id = ?
        `).bind(userId).first();
        
        if (!user.is_busy) {
            return { available: true };
        }
        
        // التحقق من أن البث ليس معلقاً (heartbeat)
        const lastHeartbeat = await this.getLastHeartbeat(user.current_competition_id);
        const now = new Date();
        const diff = (now - new Date(lastHeartbeat)) / 1000; // ثواني
        
        // إذا مر أكثر من 2 دقيقة بدون heartbeat، نعتبره غير نشط
        if (diff > 120) {
            await this.setFree(userId);
            return { available: true, wasAutoFreed: true };
        }
        
        return { 
            available: false, 
            currentCompetitionId: user.current_competition_id,
            since: user.busy_since
        };
    }
    
    // عند محاولة الانضمام لمنافسة أخرى أثناء البث
    async handleCompetitionConflict(
        userId: number, 
        newCompetitionId: number,
        action: 'switch' | 'reject'
    ): Promise<void> {
        const current = await this.checkAvailability(userId);
        
        if (!current.available && current.currentCompetitionId) {
            if (action === 'switch') {
                // إنهاء الحالية والانتقال
                await this.endCurrentCompetition(current.currentCompetitionId);
                await this.joinNewCompetition(userId, newCompetitionId);
            } else {
                // رفض ورمي المنافسة الجديدة
                await this.rejectCompetition(newCompetitionId, 'المتنافس مشغول في منافسة أخرى');
            }
        }
    }
}
```

---

### 2.2 Heartbeat System (للكشف عن الانقطاع)

```typescript
// في Client - إرسال نبضة كل 30 ثانية
setInterval(() => {
    fetch('/api/competitions/heartbeat', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
            competition_id: currentCompetitionId,
            timestamp: Date.now()
        })
    });
}, 30000);

// في Server - تسجيل النبضة
async function heartbeat(c: AppContext) {
    const { competition_id } = await c.req.json();
    const userId = c.get('userId');
    
    await db.prepare(`
        INSERT INTO competition_heartbeats 
        (competition_id, user_id, last_seen, created_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(competition_id, user_id) 
        DO UPDATE SET last_seen = datetime('now')
    `).bind(competition_id, userId).run();
    
    return c.json({ ok: true });
}

// Cron Job - فحص النبضات كل دقيقة
async function checkHeartbeats(): Promise<void> {
    const stale = await db.prepare(`
        SELECT competition_id, user_id FROM competition_heartbeats
        WHERE last_seen < datetime('now', '-2 minutes')
    `).all();
    
    for (const record of stale.results) {
        // المستخدم انقطع – إنهاء المنافسة أو تحويلها
        await handleDisconnection(record.competition_id, record.user_id);
    }
}
```

---

## 🎬 القسم الثالث: نظام البث والتسجيل (Streaming & Recording)

### 3.1 منع فقدان Chunks (Retry Queue)

```typescript
class ChunkUploader {
    private retryQueue: Array<{chunk: Blob, index: number, retries: number}> = [];
    private maxRetries = 3;
    
    async uploadChunk(chunk: Blob, index: number): Promise<void> {
        try {
            const response = await fetch('/api/chunks/upload', {
                method: 'POST',
                body: this.createFormData(chunk, index)
            });
            
            if (!response.ok) throw new Error('Upload failed');
            
            // ✅ نجح – نتأكد من أن كل السابق وصل
            await this.processRetryQueue();
            
        } catch (error) {
            // ❌ فشل – نضيف للطابور
            this.retryQueue.push({ chunk, index, retries: 0 });
            console.error(`Chunk ${index} failed, added to retry queue`);
        }
    }
    
    private async processRetryQueue(): Promise<void> {
        while (this.retryQueue.length > 0) {
            const item = this.retryQueue[0];
            
            try {
                await this.uploadWithRetry(item.chunk, item.index);
                this.retryQueue.shift(); // نجح – نحذف
            } catch (error) {
                item.retries++;
                if (item.retries >= this.maxRetries) {
                    // فشل نهائياً – نحذف ونستمر
                    this.retryQueue.shift();
                    await this.reportFailedChunk(item.index);
                }
                break; // ن detener ونحاول لاحقاً
            }
        }
    }
    
    private async uploadWithRetry(chunk: Blob, index: number): Promise<void> {
        // محاولة مع exponential backoff
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await this.uploadSingle(chunk, index);
                return;
            } catch (error) {
                await this.delay(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
            }
        }
        throw new Error('Max retries exceeded');
    }
}
```

---

### 3.2 Cleanup فوري بعد الدمج

```typescript
class RecordingManager {
    
    async mergeAndCleanup(competitionId: number): Promise<string> {
        const chunks = await this.getChunks(competitionId);
        
        // 1. الدمج
        const mergedUrl = await this.mergeChunks(chunks);
        
        // 2. التحقق من سلامة الملف
        const isValid = await this.validateMergedFile(mergedUrl);
        if (!isValid) {
            throw new Error('Merged file is corrupted');
        }
        
        // 3. ✅ الحذف الفوري (بعد نجاح الدمج فقط)
        await this.deleteChunksImmediately(chunks);
        
        // 4. تسجيل العملية
        await Logger.info('Chunks cleaned up after merge', {
            competition_id: competitionId,
            chunks_deleted: chunks.length,
            merged_size: await this.getFileSize(mergedUrl)
        });
        
        return mergedUrl;
    }
    
    private async deleteChunksImmediately(chunks: Chunk[]): Promise<void> {
        // حذف متوازي للسرعة
        await Promise.all(chunks.map(chunk => 
            fetch('/api/chunks/delete', {
                method: 'POST',
                body: JSON.stringify({ chunk_id: chunk.id })
            })
        ));
    }
}
```

---

## 📊 القسم الرابع: نظام التوصيات والعرض (Recommendation Engine)

### 4.1 عوامل التوصية (11 عامل)

| # | العامل | الوزن | التنفيذ |
|---|--------|-------|---------|
| 1 | لغة المستخدم | 25% | `language = user.language` |
| 2 | بلد المستخدم | 20% | `country = user.country` |
| 3 | الأحدث | 15% | `ORDER BY created_at DESC` |
| 4 | الأعلى مشاهدة | 10% | `ORDER BY views_count DESC` |
| 5 | الأعلى تقييماً | 10% | `ORDER BY rating DESC` |
| 6 | متابعة المستخدمين | 15% | `JOIN follows` |
| 7 | الأقسام الأكثر مشاهدة | 10% | `category_id IN (user.top_categories)` |
| 8 | الإعجابات السابقة | 10% | `similar_to_liked` |
| 9 | الصلة بالإعجابات | 10% | `content_similarity` |
| 10 | الشبه بالمشاهدات | 10% | `viewing_pattern_match` |
| 11 | عدم تكرار المشاهدة | -100% | `EXCLUDE watched` |

---

### 4.2 جداول السجلات المطلوبة

```sql
-- سجل المشاهدات
CREATE TABLE user_views (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watch_duration INTEGER, -- بالثواني
    completed BOOLEAN DEFAULT 0, -- شاهد للنهاية؟
    UNIQUE(user_id, competition_id)
);

-- سجل المشاهدات اللاحقة (المجدولة)
CREATE TABLE user_scheduled_views (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    scheduled_at DATETIME,
    reminded BOOLEAN DEFAULT 0,
    UNIQUE(user_id, competition_id)
);

-- سجل الإعجابات
CREATE TABLE user_likes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    liked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, competition_id)
);

-- سجل المتابعات
CREATE TABLE follows (
    id INTEGER PRIMARY KEY,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id)
);

-- سجل الكلمات المفتاحية (للبحث والتوصية)
CREATE TABLE user_search_keywords (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    search_count INTEGER DEFAULT 1,
    last_searched_at DATETIME,
    UNIQUE(user_id, keyword)
);
```

---

### 4.3 خوارزمية التوصية (Recommendation Algorithm)

```typescript
class RecommendationEngine {
    
    async getRecommendations(userId: number, limit: number = 20): Promise<Competition[]> {
        const user = await this.getUserProfile(userId);
        
        // 1. جمع البيانات
        const [liked, viewed, following, keywords] = await Promise.all([
            this.getLikedCompetitions(userId),
            this.getViewedCompetitions(userId),
            this.getFollowingIds(userId),
            this.getTopKeywords(userId)
        ]);
        
        // 2. بناء الـ Query الديناميكي
        let query = `
            SELECT c.*, 
                -- حساب النقاط لكل منافسة
                (CASE WHEN c.language = ? THEN 25 ELSE 0 END) +
                (CASE WHEN c.country = ? THEN 20 ELSE 0 END) +
                (c.views_count * 0.01) +
                (c.rating * 2) +
                (CASE WHEN c.creator_id IN (${following.join(',')}) THEN 15 ELSE 0 END) +
                (CASE WHEN c.category_id IN (
                    SELECT category_id FROM user_views 
                    WHERE user_id = ? GROUP BY category_id ORDER BY COUNT(*) DESC LIMIT 3
                ) THEN 10 ELSE 0 END) as score
            FROM competitions c
            WHERE c.status IN ('live', 'upcoming', 'completed')
            AND c.id NOT IN (
                SELECT competition_id FROM user_views WHERE user_id = ?
            ) -- استبعاد المشاهد
            AND c.id NOT IN (
                SELECT competition_id FROM user_hidden WHERE user_id = ?
            ) -- استبعاد المخفي
        `;
        
        // 3. إضافة فلتر الكلمات المفتاحية
        if (keywords.length > 0) {
            const keywordConditions = keywords.map(k => 
                `c.title LIKE '%${k}%' OR c.description LIKE '%${k}%'`
            ).join(' OR ');
            query += ` AND (${keywordConditions})`;
        }
        
        query += ` ORDER BY score DESC, RANDOM() LIMIT ?`;
        
        // 4. التنفيذ
        const results = await db.prepare(query).bind(
            user.language, 
            user.country, 
            userId, 
            userId, 
            userId, 
            limit
        ).all();
        
        return results.results as Competition[];
    }
    
    // التوصيات المتشابهة (لصفحة المنافسة)
    async getSimilarCompetitions(competitionId: number, limit: number = 5): Promise<Competition[]> {
        const source = await this.getCompetition(competitionId);
        
        return await db.prepare(`
            SELECT c.*,
                (
                    (CASE WHEN c.category_id = ? THEN 30 ELSE 0 END) +
                    (CASE WHEN c.subcategory_id = ? THEN 20 ELSE 0 END) +
                    (CASE WHEN c.language = ? THEN 15 ELSE 0 END) +
                    (CASE WHEN c.country = ? THEN 10 ELSE 0 END) +
                    (10 - ABS(c.rating - ?)) -- تشابه التقييم
                ) as similarity_score
            FROM competitions c
            WHERE c.id != ?
            AND c.status = 'completed'
            AND c.id NOT IN (SELECT competition_id FROM user_views WHERE user_id = ?)
            ORDER BY similarity_score DESC, RANDOM()
            LIMIT ?
        `).bind(
            source.category_id,
            source.subcategory_id,
            source.language,
            source.country,
            source.rating,
            competitionId,
            source.creator_id, -- استبعاد منافسات نفس المنشئ؟ اختياري
            limit
        ).all();
    }
}
```

---

## 🗂️ القسم الخامس: تقسيم العمل والوكلاء (Agent Assignment)

### 5.1 خريطة الوكلاء (Agent Map)

```
┌─────────────────────────────────────────────────────────────┐
│                    🎯 منسق المشروع (أنت)                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   وكيل 1     │    │   وكيل 2     │    │   وكيل 3     │
│  البنية      │    │   المنطق     │    │   الواجهة    │
│ الأساسية     │    │   الأساسي    │    │   والبث      │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ • schema.sql │    │ • حالات      │    │ • WebRTC     │
│ • Migrations │    │   المنافسة   │    │ • Jitsi      │
│ • Indexes    │    │ • الطلبات    │    │ • Countdown  │
│ • Constraints│    │ • الحظر      │    │ • Heartbeat  │
└──────────────┘    │ • الإشعارات  │    │ • Recording  │
                    │ • التوصيات   │    └──────────────┘
                    └──────────────┘
                              │
                              ▼
                    ┌──────────────┐
                    │   وكيل 4     │
                    │   الاختبار   │
                    └──────────────┘
```

---

### 5.2 تفاصيل كل وكيل

#### 🤖 وكيل 1: البنية الأساسية (Foundation Agent)

**المهمة:** إنشاء الأساس الذي يبنى عليه كل شيء

**الملفات المطلوبة:**
```
schema.sql (جديد)
├── users (مع is_busy, current_competition_id)
├── competitions (مع status CHECK constraint)
├── competition_requests (مع CASCADE)
├── competition_heartbeats (جديد)
├── competition_scheduled_tasks (جديد)
├── user_blocks (جديد)
├── user_views (جديد)
├── user_likes (جديد)
├── follows (جديد)
├── user_search_keywords (جديد)
└── notifications (مع reference_type, reference_id)

migrations/
├── 001_initial.sql
├── 002_add
