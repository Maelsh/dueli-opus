# DUELI PLATFORM - THE ULTIMATE FORENSIC AUDIT (MASTER REPORT)

**Date:** 2026-04-14
**Scope:** Deep Source-Code Evaluation (No Documentation Truster)
**Collaborators:** Claude Opus 4.6, Claude Sonnet 4.6, Antigravity AI

هذا الملف يجمع التحليل الشامل والعميق للمنصة، ويتضمن جميع الثغرات الأمنية، مشاكل قواعد البيانات، والاختلالات المنطقية. في القسم الأخير تم وضع "الموجهات الصارمة" بالإنجليزية لنسخها لوكلاء الذكاء الاصطناعي مع شرح عربي أسفل كل موجّه.

---

## 1. 🚨 Critical Security Vulnerabilities (الأخطاء الأمنية الحرجة)
1. **Plain SHA-256 Hashing:** نظام التشفير لا يستخدم الـ Salt ويسهل اختراقه. ولا توجد مقارنة آمنة للزمن (Timing Attack). (Opus)
2. **Broken Rate Limiter:** نظام الحماية من الطلبات المتكررة يعتمد على `Map` في الذاكرة، وهو أمر لا يعمل تماماً في بيئة Cloudflare Workers لأنها Stateless. (Opus)
3. **No Session Invalidations:** عند تغيير كلمة المرور للمستخدم، لا يتم تدمير الجلسات القديمة مما يبقي المخترق داخل الحساب. (Sonnet)
4. **Fake Ban System (BUG-12):** زر الحظر في لوحة تحكم الإدارة يقوم فقط بنزع "علامة التوثيق `is_verified`" من المستخدم بدلاً من تعديل حالة الحساب إلى محظور `is_active = 0`. المستخدم المحظور يستطيع الاستمرار بالدخول واستخدام المنصة! (Antigravity)
5. **No Input Sanitization:** لا يتم تنقية مدخلات المستخدم من أكواد HTML/JS مما يعرض المنصة لثغرات XSS. (Opus)
6. **Registration Crash Lock (BUG-14):** خدمة البريد الإلكتروني تستخدم رابطاً وهمياً `https://your-subdomain...`. نظراً لعدم وجود معالجة Try/Catch، فإن فشل الإرسال يؤدي لخطأ 500 يمنع المستخدم من إتمام التسجيل تماماً. (Antigravity)

---

## 2. 👻 Schema & Data Integrity (الأعمدة الوهمية والجداول)
1. **Phantom Table `user_follows`:** كل الكود يبحث في جدول `user_follows` بينما قاعدة البيانات تحتوي على جدول اسمه `follows`. وتجاهل تام لإنشاء مسارات API للمتابعة. (Opus)
2. **Missing ELO & Winner Details:** خدمة تقييم اللاعبين تعتمد على أعمدة غير موجودة تماماً مثل `users.elo_rating` و `competitions.winner_id`. (Opus)
3. **Timer Expiration Ghost Variables:** ملف الـ Cron يعتمد على أعمدة مفقودة: `current_competition_id`، `competition_heartbeats`، و `busy_since`. (Opus)
4. **All Data Defaults to Fake:** كل المستخدمين والمنافسات الجديدة يتم تسجيلهم برقم `is_fake = 1` لأن هذه كانت إعدادات للبيانات التجريبية، ولم يقم الكود بإلغائها. (Opus)
5. **Broken Cascade Deletion:** حذف المنافسة لا يحذف التقييمات، التعليقات، أو تاريخ المشاهدات المرتبط بها. (Opus)

---

## 3. 🧠 Severe Logic Flaws (الكوارث المنطقية في المنصة)
1. **Payouts Never Distribute (BUG-01):** عند انتهاء المنافسة، لا يوجد أي كود يقوم باستدعاء نظام الأرباح. الأموال تبقى معلقة للأبد. (Sonnet)
2. **Opponent Cannot Stream (BUG-11):** مسار رفع أجزاء الفيديو `chunks/register` يمنع الخصم `opponent` بالخطأ من رفع الفيديو الخاص به بحجة أنه ليس صاحب الغرفة! هذا يعطل دمج الفيديوهات للمنافسين. (Antigravity)
3. **Ratings Do Not Affect Payouts (BUG-02):** أرباح المنافسة تقسم دائماً 50% لكل لاعب لأن منطق الكود لا يقرأ تقييمات المشاهدين أبداً (التقييم يحفظ ولا يستعمل). (Sonnet)
4. **Decorative Moderation (BUG-13):** عندما يستعرض الأدمن "بلاغاً" ويختار الإجراء (مثل: حظر المستخدم)، الكود يقوم فقط بحفظ كلمة "ban_user" كنص في الجدول ولا ينفذ الحظر أو حذف المحتوى الفعلي! (Antigravity)
5. **Missing `is_busy` Enforcement (BUG-15):** وافق الكود على طلبات الانضمام المتعددة بدون التأكد مما إذا كان المستخدم داخل منافسة حية أخرى حالياً، مما يمكن لاعباً من المشاركة في 10 منافسات متزامنة في نفس اللحظة! (Antigravity)
6. **Double Cron Processing (BUG-04):** دورة معالجة المنافسات المنتهية تشتغل مرتين في كل دقيقة، مما سيسبب مضاعفة حذف البيانات والإشعارات. (Sonnet)

---

## 4. 🚷 Middleware & Routing Mishaps (مشاكل الوصلات والواجهات)
1. **Missing Routes (BUG-09):** مجلدات مسارات كاملة مثل `leaderboard`, `analytics`, `ad-blocks` تم إنشاؤها في ملفاتها وتُركت غير مقترنة في `main.ts` مما يجعلها مسارات غير موجودة 404. (Sonnet)
2. **Live Competitions Title Change (BUG-07):** الـ API يسمح للمستضيف بتعديل عنوان المنافسة وقوانينها وهي تبث بشكل مباشر، مما قد يخدع الخصم والمشاهدين. (Sonnet)
3. **Username Empty Bug (BUG-08):** لو كتب المستخدم اسمه باللغة العربية، دالة تنظيف اسم المستخدم الأجنبي ستحوله لنص فارغ `""`. (Sonnet)
4. **Broken Pagination:** استخدام `ORDER BY RANDOM()` لترتيب المنافسات المستمرة مع التصفح بالصفحات يعني ظهور نفس المنافسات عدة مرات أو اختفاء بعضها. (Opus)

---

# 🤖 5. STRICT AI AGENT DIRECTIVES (موجهات التنفيذ لوكلاء الذكاء الاصطناعي)
*These commands are designed in English to be perfectly understood by autonomous coding agents. They are arranged by priority and system safety.*

---

### DIRECTIVE 0: GLOBAL ARCHITECTURAL CONSTRAINTS 🌍
```text
TARGET: ALL AGENT OPERATIONS
ACTION:
Before executing any of the subsequent directives, the agent must strictly adhere to the following global rules:
1. Architecture (MVC & OOP): All backend features must respect the MVC pattern. Logic belongs in Models/Services, and routing belongs in Controllers. Use strict Object-Oriented Programming (OOP) paradigms.
2. Globalization (i18n): Never hardcode user-facing strings. Always use the `translations` setup and pass the appropriate language key based on the `lang` variable.
3. Design Footprint (Light/Dark Mode): The platform supports seamless dynamic switching between Light and Dark mode. Any UI/Frontend adjustments must properly utilize Tailwind CSS `dark:` variants.
4. Accessibility (a11y): Ensure that all added UI elements comply with accessibility standards (WCAG) for users with disabilities (e.g., proper aria-labels, high contrast focus states, and keyboard navigability).
```
> **📝 الشرح:**
> هذا الموجه الشامل (الموجه صفر) يُلزم وكيل الذكاء الاصطناعي باحترام بنية المنصة الأساسية في كل تعديل يقوم به. يفرض عليه احترام فصل الأكواد (MVC و OOP)، ودعم النظام ثنائي اللغة (i18n) بحيث لا يكتب نصوصاً صلبة في الكود. كما يلزمه بأن أي جزء يُضاف للواجهة يجب أن يدعم الوضع الليلي والنهاري تلقائياً، وأن يكون مهيئاً لسهولة الوصول لذوي الاحتياجات الخاصة.

---

### DIRECTIVE 1: ROOT SECURITY & BUILD STABILIZATION
```text
TARGET: src/lib/services/CryptoUtils.ts, src/controllers/AuthController.ts, src/middleware/rate-limit.ts, src/lib/services/EmailService.ts
ACTION:
1. Replace plain SHA-256 in CryptoUtils with PBKDF2 (WebCrypto API compatible) involving at least 100k iterations and a random salt saved alongside the hash. Update login comparison to use `timingSafeEqual`.
2. Fix broken EmailService by wrapping the `fetch` call in a `try/catch`. If the request fails, LOG the error and RETURN a mock success object so registration completes cleanly (no 500 error). 
3. Remove in-memory Map rate limiter in Worker code and implement Cloudflare primitive alternatives or remove `setInterval` usage.
```
> **📝 الشرح:**
> هذا الموجه يأمر الوكيل فوراً بتشفير كلمات المرور بشكل حقيقي ومحمي، ويصلح مشكلة انهيار التسجيل لو توقف نظام الإيميل (بدلاً من أن يخرج خطأ، سيوهم النظام بأنه أرسل الإيميل ويكمل تسجيلك بنجاح). كما يعالج أخطاء الكلاود فلير.

---

### DIRECTIVE 2: FIX PHANTOM SCHEMA & DATABASE MIGRATION
```text
TARGET: migrations/0007_schema_alignment.sql, src/models/UserModel.ts, src/models/SearchModel.ts
ACTION:
1. Create a migration file `0007_schema_alignment.sql` to add missing columns: `users.elo_rating`, `users.current_competition_id`, `users.busy_since`, `competitions.winner_id`, `competitions.average_rating`, and table `competition_heartbeats`.
2. Perform a global find & replace: change all variable/query references from `user_follows` to the actual table `follows`.
3. Force explicit overrides on creation queries in User and Competition models to set `is_fake = 0`, neutralizing the default test behavior.
```
> **📝 الشرح:**
> الموجه يطلب إنشاء ملف تحديث للقاعدة ليضيف كل الأعمدة المفقودة (مثل من هو الفائز، التقييم، هل هو مشغول؟). ويصلح المناداة الخاطئة لجدول المتابعات، ويمنع تسجيل الناس والمنافسات كـ "حسابات وهمية".

---

### DIRECTIVE 3: ENFORCE CRITICAL BUSINESS LOGIC
```text
TARGET: src/controllers/CompetitionController.ts, src/lib/services/ScheduledTaskService.ts
ACTION:
1. FIX BUG-11 (Opponent Chunk Upload): In `chunks/routes.ts`, allow chunk registration if `user.id === competition.creator_id OR user.id === competition.opponent_id`.
2. FIX BUG-15 (Mutex): In CompetitionController's `acceptRequest`, assert `if (requester.is_busy === 1) return this.error(...)`. When a competition starts, explicitly update `is_busy = 1` for BOTH creator and opponent.
3. FIX BUG-01 & BUG-02 (Payouts): Explicitly trigger `LivePayoutEngine.finalizePayouts(competitionId)` inside ` कंपटीशन.end()`. Update split logic to read ratings.
4. Remove `ORDER BY RANDOM()` in `CompetitionModel.findByFilters` and order by standard columns (e.g., created_at DESC).
```
> **📝 الشرح:**
> يحل ثغرة منع الخصم من رفع أجزاء الفيديو (مما يعطل دمج المواجهات). ويمنع ثغرة الموافقة المتعددة التي تدخل اللاعب في 10 مواجهات بنفس الوقت، ويجبر كود إنهاء المنافسة على "توزيع الأرباح" فعلياً حسب التقييم بدلاً من تجاهلها.

---

### DIRECTIVE 4: FIX THE FAKE MODERATION & BAN SYSTEMS
```text
TARGET: src/controllers/AdminController.ts, src/middleware/auth.ts
ACTION:
1. FIX BUG-12: Update `toggleUserBan` to alter `users.is_active` (1 or 0), not `is_verified`. 
2. Edit `authMiddleware` database check to verify `is_active = 1`. If `0`, reject with 403 Forbidden and force logout/session destruction.
3. FIX BUG-13: In `reviewReport`, switch on `body.action_taken` to implement actual behaviors. (e.g., if action is 'ban_user', await query to update is_active=0).
4. FIX BUG-05: Modify `resetPassword` in AuthController to invoke `SessionModel.deleteByUser(user.id)` to nuke preexisting sessions.
```
> **📝 الشرح:**
> يصلح خديعة زر الـ Ban (الذي كان ينزع التوثيق فقط). الآن سيقوم بطرد المستخدم فوراً وتعطيل جلساته. كذلك سيفعل أزرار الإبلاغات لتقوم بتنفيذ الحكم الفعلي (طرد/حذف تعليق) وتدمير تسجيل الدخول عند تغيير باسوورد حساب مخترق.

---

### DIRECTIVE 5: SYNCHRONIZATION AND ORPHAN CLEANUP
```text
TARGET: src/main.ts, wrangler.jsonc, src/controllers/CompetitionController.ts
ACTION:
1. Mount all missing API modules in `main.ts` (leaderboard, ad-blocks, ad-reports, analytics).
2. Fix BUG-07: In CompetitionController's `update()` method, throw a Forbidden error if `competition.status` is `live` or `completed` to prevent title/rules tampering mid-stream.
3. Fix the Username logic in user registration to retain Non-ASCII (Arabic) characters using proper decoding/slugification.
4. Establish Cron triggers in `wrangler.jsonc` ensuring ScheduledTaskService fires correctly, resolving BUG-04 double processing.
```
> **📝 الشرح:**
> يربط الملفات المجهولة والخفية (مثل سجل المتصدرين) بالواجهة الرئيسية. ويمنع المستضيف من التلاعب وتغيير عنوان المنافسة وشروطها وهي تُبث على الهواء للناس. كما يصلح مشكلة اختفاء الأسماء لو كتبت بالعربية.
