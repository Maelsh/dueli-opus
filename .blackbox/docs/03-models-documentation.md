# توثيق ملفات الـ Models
## Documentation of Models Files

**المسار:** `d:/projects/opus-dueli/webapp/src/models/`

---

## الملف: src/models/base/BaseModel.ts

### الغرض العام
 فئة BaseModel هي الفئة الأساسية المجردة التي ترث منها جميع نماذج قاعدة البيانات في منصة Dueli. توفر هذه الفئة عمليات CRUD الأساسية مثل البحث والتحديث والحذف، كما توفر واجهة QueryOptions للتعامل مع استعلامات قاعدة البيانات بشكل موحد. تعمل هذه الفئة كطبقة تجريد فوق قاعدة بيانات D1 من Cloudflare Workers.

### الكلاس/الواجهات

#### BaseModel<T extends BaseEntity> (سطر 25-152)
- **النوع:** class
- **الوراثة:** Abstract Class
- **الغرض:** فئة أساسية مجردة توفر عمليات قاعدة البيانات لجميع النماذج الفرعية

##### الخصائص (Properties)
| الاسم | النوع | السطر | الغرض |
|-------|-------|-------|-------|
| db | D1Database | 26 | اتصال قاعدة البيانات |
| tableName | string | 29 | اسم الجدول في قاعدة البيانات (يجب تعريفه في الفئة الفرعية) |
| primaryKey | string | 32 | اسم العمود المفتاح الأساسي (افتراضي: 'id') |

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findById | id: number | Promise<T \| null> | 41-45 | البحث عن سجل بالمعرف |
| findAll | options: QueryOptions | Promise<T[]> | 50-58 | جلب جميع السجلات مع التصفح |
| findOne | column: string, value: any | Promise<T \| null> | 63-67 | البحث عن سجل واحد شرط |
| findBy | column: string, value: any, options: QueryOptions | Promise<T[]> | 72-80 | البحث عن سجلات متعددة بشرط |
| count | () | Promise<number> | 85-91 | عد جميع السجلات |
| countBy | column: string, value: any | Promise<number> | 96-102 | عد السجلات بشرط |
| exists | id: number | Promise<boolean> | 107-113 | التحقق من وجود سجل |
| delete | id: number | Promise<boolean> | 118-124 | حذف سجل |
| query | sql: string, ...params: any[] | Promise<R[]> | 129-132 | تنفيذ استعلام مخصص |
| queryOne | sql: string, ...params: any[] | Promise<R \| null> | 137-139 | تنفيذ استعلام مخصص لنتائج واحدة |
| create | data: Partial<T> | Promise<T> | 144 | إنشاء سجل جديد (تجريد) |
| update | id: number, data: Partial<T> | Promise<T \| null> | 149 | تحديث سجل (تجريد) |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 43
SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?
```

```sql
-- سطر 54
SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?
```

```sql
-- سطر 65
SELECT * FROM ${this.tableName} WHERE ${column} = ?
```

```sql
-- سطر 76
SELECT * FROM ${this.tableName} WHERE ${column} = ? LIMIT ? OFFSET ?
```

```sql
-- سطر 87
SELECT COUNT(*) as count FROM ${this.tableName}
```

```sql
-- سطر 98
SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${column} = ?
```

```sql
-- سطر 109
SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = ?
```

```sql
-- سطر 120
DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?
```

### الاستيرادات (Imports)
- `[BaseEntity]` from `../../config/types` - نوع البيانات الأساسي للكيانات

### ملاحظات
- هذه الفئة تجريدية ولا يمكن إنشاء كائنات منها مباشرة
- يجب على كل نموذج أن يرث من هذه الفئة ويحدد tableName
- دالتي create و update يجب إعادة تعريفها في الفئات الفرعية

---

## الملف: src/models/AdvertisementModel.ts

### الغرض العام
 نموذج AdvertisementModel يتعامل مع إدارة الإعلانات في منصة Dueli. يوفر النموذج واجهات للإعلانات ومرات الظهور (impressions) وأرباح المستخدمين. يتضمن نموذجين رئيسيين: AdvertisementModel للإعلانات و EarningsModel للأرباح. يدعم النظام توزيع الأرباح بناءً على التقييمات (80% للمنافسين و 20% للمنصة).

### الكلاس/الواجهات

#### Advertisement (سطر 13-24)
- **النوع:** interface
- **الغرض:** واجهة بيانات الإعلان

| الاسم | النوع | الغرض |
|-------|-------|-------|
| id | number | معرف الإعلان |
| title | string | عنوان الإعلان |
| image_url | string \| null | صورة الإعلان |
| link_url | string \| null | رابط الإعلان |
| is_active | number | حالة التفعيل |
| views_count | number | عدد المشاهدات |
| clicks_count | number | عدد النقرات |
| revenue_per_view | number | الإيراد لكل مشاهدة |
| created_by | number | معرف المنشئ |
| created_at | string | تاريخ الإنشاء |

#### AdImpression (سطر 29-35)
- **النوع:** interface
- **الغرض:** واجهة مرات ظهور الإعلان

#### UserEarnings (سطر 40-47)
- **النوع:** interface
- **الغرض:** واجهة أرباح المستخدم

#### AdvertisementModel (سطر 53-173)
- **النوع:** class
- **الوراثة:** extends BaseModel<Advertisement>
- **الغرض:** نموذج إدارة الإعلانات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<Advertisement> | Promise<Advertisement> | 63-83 | إنشاء إعلان جديد |
| update | id: number, data: Partial<Advertisement> | Promise<Advertisement \| null> | 88-121 | تحديث إعلان |
| getActiveAds | limit: number | Promise<Advertisement[]> | 126-134 | جلب الإعلانات النشطة |
| recordImpression | adId: number, competitionId: number, userId: number \| null | Promise<void> | 139-150 | تسجيل ظهور |
| recordClick | adId: number | Promise<void> | 155-159 | تسجيل نقرة |
| getCompetitionRevenue | competitionId: number | Promise<number> | 164-172 | جلب إيرادات المنافسة |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 66-68
INSERT INTO advertisements (title, image_url, link_url, is_active, revenue_per_view, created_by, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

```sql
-- سطر 128-131
SELECT * FROM advertisements WHERE is_active = 1 ORDER BY RANDOM() LIMIT ?
```

```sql
-- سطر 142-144
INSERT INTO ad_impressions (ad_id, competition_id, user_id, created_at) VALUES (?, ?, ?, ?)
```

```sql
-- سطر 147-148
UPDATE advertisements SET views_count = views_count + 1 WHERE id = ?
```

```sql
-- سطر 165-169
SELECT SUM(a.revenue_per_view) as total FROM ad_impressions i JOIN advertisements a ON i.ad_id = a.id WHERE i.competition_id = ?
```

#### EarningsModel (سطر 179-272)
- **النوع:** class
- **الوراثة:** extends BaseModel<UserEarnings>
- **الغرض:** نموذج إدارة الأرباح

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<UserEarnings> | Promise<UserEarnings> | 189-200 | إنشاء سجل أرباح |
| update | id: number, data: Partial<UserEarnings> | Promise<UserEarnings \| null> | 205-212 | تحديث سجل أرباح |
| getUserTotalEarnings | userId: number | Promise<{...}> | 217-227 | جلب إجمالي أرباح المستخدم |
| getUserEarnings | userId: number, limit: number, offset: number | Promise<UserEarnings[]> | 232-242 | جلب تاريخ أرباح المستخدم |
| calculateAndDistribute | competitionId: number, creatorId: number, opponentId: number, creatorRating: number, opponentRating: number, totalRevenue: number | Promise<void> | 248-271 | حساب وتوزيع الأرباح |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 192-193
INSERT INTO user_earnings (user_id, competition_id, amount, status, created_at) VALUES (?, ?, ?, 'pending', ?)
```

```sql
-- سطر 208
UPDATE user_earnings SET status = ? WHERE id = ?
```

```sql
-- سطر 219-225
SELECT SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid,
       SUM(amount) as total FROM user_earnings WHERE user_id = ?
```

```sql
-- سطر 234-239
SELECT e.*, c.title as competition_title FROM user_earnings e LEFT JOIN competitions c ON e.competition_id = c.id WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT ? OFFSET ?
```

### الاستيرادات (Imports)
- `[D1Database]` from `@cloudflare/workers-types` - نوع قاعدة بيانات D1
- `[BaseModel]` from `./base/BaseModel` - فئة النموذج الأساسية

### ملاحظات
- نظام الأرباح يوزع 80% للمنافسين بناءً على نسبة التقييم
- المستخدمون الذين لم يحصلوا على تقييم يقسمون الأرباح بالتساوي
- كل نقرة تزيد عداد النقرات وكل مشاهدة تزيد عداد المشاهدات

---

## الملف: src/models/CategoryModel.ts

### الغرض العام
 نموذج CategoryModel يتعامل مع إدارة الفئات والتصنيفات في منصة Dueli. يدعم النموذج هيكل الفئات الهرمي (فئات فرعية داخل فئات رئيسية)، ويوفر دوال للبحث عن الفئات وتصفحها. يمكن للفئات أن تكون فئات رئيسية (بدون parent_id) أو فئات فرعية (مع parent_id)، مما يسمح بتنظيم المحتوى بشكل تسلسلي.

### الكلاس/الواجهات

#### CategoryWithSubcategories (سطر 14-16)
- **النوع:** interface
- **الغرض:** واجهة الفئة مع الفئات الفرعية

#### CategoryModel (سطر 21-121)
- **النوع:** class
- **الوراثة:** extends BaseModel<Category>
- **الغرض:** نموذج إدارة الفئات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findParentCategories | () | Promise<Category[]> | 27-31 | جلب الفئات الرئيسية |
| findSubcategories | parentId: number | Promise<Category[]> | 36-41 | جلب الفئات الفرعية |
| findBySlug | slug: string | Promise<Category \| null> | 46-48 | البحث بالفئة بالرابط |
| findAllWithSubcategories | () | Promise<CategoryWithSubcategories[]> | 53-63 | جلب كل الفئات مع فئاتها الفرعية |
| findAllWithParent | () | Promise<Category[]> | 68-76 | جلب كل الفئات مع معلومات الأب |
| create | data: Partial<Category> | Promise<Category> | 81-96 | إنشاء فئة جديدة |
| update | id: number, data: Partial<Category> | Promise<Category \| null> | 101-120 | تحديث فئة |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 29
SELECT * FROM categories WHERE parent_id IS NULL AND is_active = 1 ORDER BY sort_order ASC
```

```sql
-- سطر 38
SELECT * FROM categories WHERE parent_id = ? AND is_active = 1 ORDER BY sort_order ASC
```

```sql
-- سطر 69-75
SELECT c.*, p.name_ar as parent_name_ar, p.name_en as parent_name_en FROM categories c LEFT JOIN categories p ON c.parent_id = p.id WHERE c.is_active = 1 ORDER BY c.parent_id NULLS FIRST, c.sort_order
```

```sql
-- سطر 83-84
INSERT INTO categories (name_ar, name_en, slug, icon, color, parent_id, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
```

### الاستيرادات (Imports)
- `[BaseModel]` from `./base/BaseModel` - فئة النموذج الأساسية
- `[Category]` from `../config/types` - نوع بيانات الفئة

### ملاحظات
- الفئات مرتبة حسب sort_order
- يمكن تعطيل الفئات (is_active = 0) دون حذفها
- يدعم النظام اللغتين العربية والإنجليزية في الأسماء

---

## الملف: src/models/CommentModel.ts

### الغرض العام
 نموذج CommentModel يتعامل مع إدارة التعليقات على المنافسات في منصة Dueli. يوفر النموذج دوال لإنشاء التعليقات وعرضها مع بيانات المستخدم (الاسم وال头像 ومعرف المستخدم). عند إنشاء تعليق جديد، يتم تحديث عداد التعليقات في جدول المنافسات تلقائياً.

### الكلاس/الواجهات

#### CommentWithUser (سطر 12-16)
- **النوع:** interface
- **الغرض:** واجهة التعليق مع بيانات المستخدم

#### CommentModel (سطر 21-73)
- **النوع:** class
- **الوراثة:** extends BaseModel<Comment>
- **الغرض:** نموذج إدارة التعليقات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findByCompetition | competitionId: number, options: QueryOptions | Promise<CommentWithUser[]> | 27-38 | جلب تعليقات المنافسة |
| create | data: Partial<Comment> | Promise<Comment> | 43-60 | إنشاء تعليق جديد |
| update | id: number, data: Partial<Comment> | Promise<Comment \| null> | 65-72 | تحديث تعليق |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 30-36
SELECT c.*, u.display_name, u.avatar_url, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.competition_id = ? ORDER BY c.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 45-46
INSERT INTO comments (competition_id, user_id, content, is_live, created_at) VALUES (?, ?, ?, ?, datetime('now'))
```

```sql
-- سطر 55-56
UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?
```

```sql
-- سطر 68
UPDATE comments SET content = ? WHERE id = ?
```

### الاستيرادات (Imports)
- `[BaseModel, QueryOptions]` from `./base/BaseModel` - فئة النموذج الأساسية
- `[Comment]` from `../config/types` - نوع بيانات التعليق

### ملاحظات
- التعليقات مرتبة تنازلياً حسب التاريخ (الأحدث أولاً)
- عند حذف تعليق، يجب تقليل عداد التعليقات يدوياً
- التعليقات الحية (is_live) تُعرض بشكل مختلف

---

## الملف: src/models/CompetitionModel.ts

### الغرض العام
 نموذج CompetitionModel هو من أهم النماذج في منصة Dueli حيث يتعامل مع قلب المنصة - إدارة المنافسات. يوفر النموذج دوال شاملة لإنشاء وتحديث وإدارة المنافسات بجميع حالاتها (معلقة، مباشرة، مكتملة). يدعم النموذج تصفية المنافسات بعدة معايير مثل الحالة والفئة واللغة والبلد ومعرف المستخدم، كما يوفر دوال للبحث عن المنافسات مع تفاصيل كاملة (اسم الفئة، بيانات المنشئ والخصم).

### الكلاس/الواجهات

#### CompetitionFilters (سطر 14-25)
- **النوع:** interface
- **الغرض:** واجهة تصفية المنافسات

#### CompetitionWithDetails (سطر 30-45)
- **النوع:** interface
- **الغرض:** واجهة المنافسة مع كل التفاصيل

#### CreateCompetitionData (سطر 50-60)
- **النوع:** interface
- **الغرض:** واجهة إنشاء منافسة جديدة

#### CompetitionModel (سطر 65-353)
- **النوع:** class
- **الوراثة:** extends BaseModel<Competition>
- **الغرض:** نموذج إدارة المنافسات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findWithDetails | id: number | Promise<CompetitionWithDetails \| null> | 71-95 | جلب منافسة بالتفاصيل |
| findByFilters | filters: CompetitionFilters | Promise<CompetitionWithDetails[]> | 100-194 | جلب منافسات بالتصفية |
| findByUser | userId: number, options: QueryOptions | Promise<CompetitionWithDetails[]> | 199-213 | جلب منافسات المستخدم |
| create | data: CreateCompetitionData | Promise<Competition> | 218-237 | إنشاء منافسة جديدة |
| update | id: number, data: Partial<Competition> | Promise<Competition \| null> | 242-265 | تحديث منافسة |
| setOpponent | id: number, opponentId: number | Promise<boolean> | 270-275 | تعيين خصم للمنافسة |
| startLive | id: number, options?: {...} | Promise<boolean> | 280-298 | بدء البث المباشر |
| complete | id: number, options?: {...} | Promise<boolean> | 303-321 | إنهاء المنافسة |
| updateStreamStatus | id: number, status: string | Promise<boolean> | 326-331 | تحديث حالة البث |
| setVodUrl | id: number, vodUrl: string | Promise<boolean> | 336-343 | تعيين رابط الفيديو |
| incrementViews | id: number | Promise<void> | 348-352 | زيادة عداد المشاهدات |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 72-94
SELECT c.*, cat.name_ar as category_name_ar, cat.name_en as category_name_en, cat.slug as category_slug, cat.icon as category_icon, COALESCE(subcat.color, cat.color) as category_color, subcat.name_ar as subcategory_name_ar, subcat.name_en as subcategory_name_en, subcat.slug as subcategory_slug, creator.display_name as creator_name, creator.avatar_url as creator_avatar, creator.username as creator_username, opponent.display_name as opponent_name, opponent.avatar_url as opponent_avatar, opponent.username as opponent_username FROM competitions c JOIN categories cat ON c.category_id = cat.id LEFT JOIN categories subcat ON c.subcategory_id = subcat.id JOIN users creator ON c.creator_id = creator.id LEFT JOIN users opponent ON c.opponent_id = opponent.id WHERE c.id = ?
```

```sql
-- سطر 220-223
INSERT INTO competitions (title, description, rules, category_id, subcategory_id, creator_id, language, country, scheduled_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
```

```sql
-- سطر 272
UPDATE competitions SET opponent_id = ?, status = "accepted" WHERE id = ? AND opponent_id IS NULL
```

```sql
-- سطر 287-295
UPDATE competitions SET status = 'live', started_at = datetime('now'), youtube_live_id = ?, live_url = ?, stream_status = 'live', stream_started_at = datetime('now') WHERE id = ?
```

```sql
-- سطر 310-318
UPDATE competitions SET status = 'completed', ended_at = datetime('now'), youtube_video_url = ?, vod_url = ?, stream_status = 'ready', stream_ended_at = datetime('now') WHERE id = ?
```

### الاستيرادات (Imports)
- `[BaseModel, QueryOptions]` from `./base/BaseModel` - فئة النموذج الأساسية
- `[Competition, CompetitionStatus]` from `../config/types` - أنواع بيانات المنافسة

### ملاحظات
- حالات المنافسة: pending (بانتظار خصم)، accepted (مجدولة)، live (مباشرة)، completed (مكتملة)
- يدعم النظام بث YouTube و P2P
- عداد المشاهدات يزداد تلقائياً

---

## الملف: src/models/LikeModel.ts

### الغرض العام
 نموذج LikeModel يتعامل مع إدارة الإعجابات على المنافسات في منصة Dueli. يوفر النموذج دوال للتحقق من إعجاب المستخدم وإضافة وإزالة الإعجابات وجلب عدد الإعجابات وقائمة المستخدمين الذين أعجبوا بمنافسة معينة. يمنع النظام إضافة نفس الإعجاب مرتين لنفس المستخدم والمنافسة.

### الكلاس/الواجهات

#### Like (سطر 13-18)
- **النوع:** interface
- **الغرض:** واجهة بيانات الإعجاب

#### LikeWithUser (سطر 23-27)
- **النوع:** interface
- **الغرض:** واجهة الإعجاب مع بيانات المستخدم

#### LikeModel (سطر 33-148)
- **النوع:** class
- **الوراثة:** extends BaseModel<Like>
- **الغرض:** نموذج إدارة الإعجابات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<Like> | Promise<Like> | 43-53 | إنشاء إعجاب |
| update | id: number, data: Partial<Like> | Promise<Like \| null> | 58-61 | تحديث إعجاب (غير مستخدم) |
| hasLiked | userId: number, competitionId: number | Promise<boolean> | 66-71 | التحقق من وجود إعجاب |
| addLike | userId: number, competitionId: number | Promise<Like \| null> | 76-91 | إضافة إعجاب |
| removeLike | userId: number, competitionId: number | Promise<boolean> | 96-101 | إزالة إعجاب |
| getLikeCount | competitionId: number | Promise<number> | 106-111 | جلب عدد الإعجابات |
| getLikers | competitionId: number, limit: number, offset: number | Promise<LikeWithUser[]> | 116-126 | جلب قائمة المعجبين |
| getUserLikes | userId: number, limit: number, offset: number | Promise<any[]> | 131-147 | جلب منافسات أعجبت للمستخدم |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 46
INSERT INTO likes (user_id, competition_id, created_at) VALUES (?, ?, ?)
```

```sql
-- سطر 68
SELECT id FROM likes WHERE user_id = ? AND competition_id = ?
```

```sql
-- سطر 98
DELETE FROM likes WHERE user_id = ? AND competition_id = ?
```

```sql
-- سطر 108
SELECT COUNT(*) as count FROM likes WHERE competition_id = ?
```

```sql
-- سطر 117-123
SELECT l.*, u.username, u.display_name, u.avatar_url FROM likes l JOIN users u ON l.user_id = u.id WHERE l.competition_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 133-144
SELECT c.*, l.created_at as liked_at, u.username as creator_username, u.display_name as creator_display_name, cat.name_ar as category_name_ar, cat.name_en as category_name_en FROM likes l JOIN competitions c ON l.competition_id = c.id JOIN users u ON c.creator_id = u.id LEFT JOIN categories cat ON c.category_id = cat.id WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?
```

### الاستيرادات (Imports)
- `[D1Database]` from `@cloudflare/workers-types` - نوع قاعدة بيانات D1
- `[BaseModel]` from `./base/BaseModel` - فئة النموذج الأساسية

### ملاحظات
- الإعجابات لا تُحدث، تُضاف أو تُحذف فقط
- لا يمكن للمستخدم أن يعجب بنفسه بمنافسة مرتين

---

## الملف: src/models/MessageModel.ts

### الغرض العام
 نموذج MessageModel يتعامل مع إدارة الرسائل الخاصة والمحادثات بين المستخدمين في منصة Dueli. يتضمن النموذج كلاسين: MessageModel لإدارة الرسائل الفردية و ConversationModel لإدارة المحادثات. يوفر النظام دوال لإنشاء المحادثات والبحث عن محادثة موجودة بين مستخدمين وإرسال الرسائل وقراءة الرسائل وجلب قائمة المحادثات.

### الكلاس/الواجهات

#### Conversation (سطر 13-19)
- **النوع:** interface
- **الغرض:** واجهة المحادثة

#### ConversationWithUser (سطر 24-31)
- **النوع:** interface
- **الغرض:** واجهة المحادثة مع بيانات المستخدم الآخر

#### Message (سطر 36-43)
- **النوع:** interface
- **الغرض:** واجهة الرسالة

#### MessageWithSender (سطر 48-52)
- **النوع:** interface
- **الغرض:** واجهة الرسالة مع بيانات المرسل

#### MessageModel (سطر 58-141)
- **النوع:** class
- **الوراثة:** extends BaseModel<Message>
- **الغرض:** نموذج إدارة الرسائل

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<Message> | Promise<Message> | 68-84 | إنشاء رسالة |
| update | id: number, data: Partial<Message> | Promise<Message \| null> | 89-96 | تحديث رسالة |
| getConversationMessages | conversationId: number, limit: number, offset: number | Promise<MessageWithSender[]> | 101-116 | جلب رسائل محادثة |
| markAsRead | conversationId: number, userId: number | Promise<void> | 121-128 |标记 الرسائل كمقروءة |
| getUnreadCount | userId: number | Promise<number> | 133-140 | جلب عدد الرسائل غير المقروءة |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 70-72
INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)
```

```sql
-- سطر 77-78
UPDATE conversations SET last_message_at = ? WHERE id = ?
```

```sql
-- سطر 107-113
SELECT m.*, u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 124-126
UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL
```

```sql
-- سطر 135-137
SELECT COUNT(*) as count FROM messages WHERE m.receiver_id = ? AND m.is_read = 0
```

#### ConversationModel (سطر 147-233)
- **النوع:** class
- **الوراثة:** extends BaseModel<Conversation>
- **الغرض:** نموذج إدارة المحادثات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<Conversation> | Promise<Conversation> | 157-168 | إنشاء محادثة |
| update | id: number, data: Partial<Conversation> | Promise<Conversation \| null> | 173-180 | تحديث محادثة |
| findOrCreate | user1Id: number, user2Id: number | Promise<Conversation> | 185-199 | البحث أو إنشاء محادثة |
| getUserConversations | userId: number, limit: number, offset: number | Promise<ConversationWithUser[]> | 204-221 | جلب محادثات المستخدم |
| userHasAccess | conversationId: number, userId: number | Promise<boolean> | 226-232 | التحقق من صلاحية الوصول |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 159-161
INSERT INTO conversations (user1_id, user2_id, created_at) VALUES (?, ?, ?)
```

```sql
-- سطر 190-192
SELECT * FROM conversations WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
```

```sql
-- سطر 205-218
SELECT c.*, CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id, u.username as other_username, u.display_name as other_display_name, u.avatar_url as other_avatar, (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message, (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) as unread_count FROM conversations c JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END WHERE c.user1_id = ? OR c.user2_id = ? ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT ? OFFSET ?
```

### الاستيرادات (Imports)
- `[D1Database]` from `@cloudflare/workers-types` - نوع قاعدة بيانات D1
- `[BaseModel]` from `./base/BaseModel` - فئة النموذج الأساسية

### ملاحظات
- ترتيب المعرفات في إنشاء المحادثة يتم تطبيعها لمنع التكرار
- الرسائل غير المرسلة من المستخدم الآخر فقط تُعتبر غير مقروءة
- المحادثات مرتبة حسب آخر رسالة أو تاريخ الإنشاء

---

## الملف: src/models/NotificationModel.ts

### الغرض العام
 نموذج NotificationModel يتعامل مع إدارة إشعارات المستخدمين في منصة Dueli. يوفر النموذج دوال لإنشاء الإشعارات وجلبها و markتها كمقروءة. يدعم النظام أنواعاً مختلفة من الإشعار مثل إشعارات المتابعين والمنافسات والرسائل والتعليقات، كما يوفر إمكانية جلب الإشعارات غير المقروءة فقط وحساب عددها.

### الكلاس/الواجهات

#### CreateNotificationData (سطر 12-19)
- **النوع:** interface
- **الغرض:** واجهة إنشاء إشعار

#### NotificationModel (سطر 24-110)
- **النوع:** class
- **الوراثة:** extends BaseModel<Notification>
- **الغرض:** نموذج إدارة الإشعارات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findByUser | userId: number, options: QueryOptions | Promise<Notification[]> | 30-37 | جلب إشعارات المستخدم |
| findUnread | userId: number | Promise<Notification[]> | 42-47 | جلب الإشعارات غير المقروءة |
| countUnread | userId: number | Promise<number> | 52-58 | عد الإشعارات غير المقروءة |
| create | data: CreateNotificationData | Promise<Notification> | 63-77 | إنشاء إشعار جديد |
| update | id: number, data: Partial<Notification> | Promise<Notification \| null> | 82-89 | تحديث إشعار |
| markAsRead | id: number | Promise<boolean> | 94-99 | mark إشعار كمقروء |
| markAllAsRead | userId: number | Promise<number> | 104-109 | mark جميع الإشعارات كمقروءة |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 34
SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 44
SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC
```

```sql
-- سطر 54
SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
```

```sql
-- سطر 64-66
INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
```

```sql
-- سطر 85
UPDATE notifications SET is_read = ? WHERE id = ?
```

```sql
-- سطر 96
UPDATE notifications SET is_read = 1 WHERE id = ?
```

```sql
-- سطر 106
UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0
```

### الاستيرادات (Imports)
- `[BaseModel, QueryOptions]` from `./base/BaseModel` - فئة النموذج الأساسية
- `[Notification, NotificationType]` from `../config/types` - أنواع بيانات الإشعار

### ملاحظات
- الإشعارات الجديدة تُنشأ تلقائياً كغير مقروءة
- يمكن ربط الإشعار ببيانات مرجعية (reference_type, reference_id)
- دالة markAllAsRead تُرجع عدد السجلات المحدثة

---

## الملف: src/models/ReportModel.ts

### الغرض العام
 نموذج ReportModel يتعامل مع إدارة البلاغات في منصة Dueli. يوفر النموذج دوال لإنشاء البلاغات ومراجعتها من قبل المشرفين. يدعم النظام أنواعاً مختلفة من الأهداف (مستخدم، منافسة، تعليق) وحالات متعددة للبلاغ (قيد المراجعة، تم حله، تم رفضه). يتضمن النموذج قائمة بأسباب البلاغات المعرفة مسبقاً لكل نوع من الأهداف.

### الكلاس/الواجهات

#### ReportTargetType (سطر 13)
- **النوع:** type
- **الغرض:** أنواع أهداف البلاغات

#### ReportStatus (سطر 18)
- **النوع:** type
- **الغرض:** حالات البلاغ

#### Report (سطر 23-35)
- **النوع:** interface
- **الغرض:** واجهة بيانات البلاغ

#### ReportWithDetails (سطر 40-45)
- **النوع:** interface
- **الغرض:** واجهة البلاغ بالتفاصيل

#### CreateReportData (سطر 50-56)
- **النوع:** interface
- **الغرض:** واجهة إنشاء بلاغ

#### REPORT_REASONS (سطر 61-65)
- **النوع:** const
- **الغرض:** أسباب البلاغات المعرفة

#### ReportModel (سطر 71-297)
- **النوع:** class
- **الوراثة:** extends BaseModel<Report>
- **الغرض:** نموذج إدارة البلاغات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<Report> | Promise<Report> | 81-100 | إنشاء بلاغ |
| update | id: number, data: Partial<Report> | Promise<Report \| null> | 105-134 | تحديث بلاغ |
| hasReported | reporterId: number, targetType: ReportTargetType, targetId: number | Promise<boolean> | 139-144 | التحقق من وجود بلاغ سابق |
| createReport | data: CreateReportData | Promise<Report \| null> | 149-173 | إنشاء بلاغ جديد مع التحقق |
| getPendingReports | limit: number, offset: number | Promise<ReportWithDetails[]> | 178-190 | جلب البلاغات المعلقة |
| getReports | filters: {...} | Promise<ReportWithDetails[]> | 195-231 | جلب البلاغات بالتصفية |
| getCountByStatus | () | Promise<Record<ReportStatus, number>> | 236-255 | جلب عدد البلاغات بالحالة |
| reviewReport | reportId: number, reviewerId: number, status: ReportStatus, actionTaken?: string | Promise<boolean> | 260-273 | مراجعة بلاغ |
| getReportsForTarget | targetType: ReportTargetType, targetId: number | Promise<Report[]> | 278-285 | جلب بلاغات لهدف معين |
| getReportCount | targetType: ReportTargetType, targetId: number | Promise<number> | 290-296 | جلب عدد البلاغات لهدف |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 84-86
INSERT INTO reports (reporter_id, target_type, target_id, reason, description, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)
```

```sql
-- سطر 141
SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?
```

```sql
-- سطر 157-159
INSERT INTO reports (reporter_id, target_type, target_id, reason, description, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)
```

```sql
-- سطر 180-187
SELECT r.*, u.username as reporter_username, u.display_name as reporter_display_name FROM reports r JOIN users u ON r.reporter_id = u.id WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 218-228
SELECT r.*, u.username as reporter_username, u.display_name as reporter_display_name, rv.username as reviewer_username FROM reports r JOIN users u ON r.reporter_id = u.id LEFT JOIN users rv ON r.reviewed_by = rv.id WHERE ${whereClause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 238-240
SELECT status, COUNT(*) as count FROM reports GROUP BY status
```

```sql
-- سطر 267-270
UPDATE reports SET status = ?, reviewed_by = ?, reviewed_at = ?, action_taken = ? WHERE id = ?
```

```sql
-- سطر 280-282
SELECT * FROM reports WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC
```

```sql
-- سطر 292-293
SELECT COUNT(*) as count FROM reports WHERE target_type = ? AND target_id = ?
```

### الاستيرادات (Imports)
- `[D1Database]` from `@cloudflare/workers-types` - نوع قاعدة بيانات D1
- `[BaseModel]` from `./base/BaseModel` - فئة النموذج الأساسية

### ملاحظات
- لا يمكن للمستخدم إنشاء أكثر من بلاغ لنفس الهدف
- حالات البلاغ: pending (قيد المراجعة)، reviewed (مراجع)، resolved (تم حله)، dismissed (مرفوض)
- المشرفون يمكنهم مراجعة البلاغات وتغيير حالتها

---

## الملف: src/models/ScheduleModel.ts

### الغرض العام
 نموذج ScheduleModel يتعامل مع إدارة الجدولة والتذكيرات للمنافسات في منصة Dueli. يوفر النموذج دوال لإنشاء التذكيرات للمنافسات المجدولة وإدارتها. يمكن للمستخدمين إضافة تذكيرات للمنافسات التي يرغبون في مشاهدتها، ويوفر النظام دوال لجلب التذكيرات المعلقة وتلك التي تحتاج إلى إرسال.

### الكلاس/الواجهات

#### CompetitionReminder (سطر 13-20)
- **النوع:** interface
- **الغرض:** واجهة تذكير المنافسة

#### ReminderWithDetails (سطر 25-29)
- **النوع:** interface
- **الغرض:** واجهة التذكير بالتفاصيل

#### ScheduleModel (سطر 35-156)
- **النوع:** class
- **الوراثة:** extends BaseModel<CompetitionReminder>
- **الغرض:** نموذج إدارة الجدولة

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<CompetitionReminder> | Promise<CompetitionReminder> | 45-56 | إنشاء تذكير |
| update | id: number, data: Partial<CompetitionReminder> | Promise<CompetitionReminder \| null> | 61-68 | تحديث تذكير |
| hasReminder | competitionId: number, userId: number | Promise<boolean> | 73-78 | التحقق من وجود تذكير |
| addReminder | competitionId: number, userId: number, remindAt: string | Promise<CompetitionReminder \| null> | 83-88 | إضافة تذكير |
| removeReminder | competitionId: number, userId: number | Promise<boolean> | 93-98 | إزالة تذكير |
| getUserReminders | userId: number, limit: number | Promise<ReminderWithDetails[]> | 103-114 | جلب تذكيرات المستخدم |
| getPendingReminders | () | Promise<ReminderWithDetails[]> | 119-131 | جلب التذكيرات المعلقة للإرسال |
| markSent | reminderId: number | Promise<void> | 136-138 | mark تذكير كمُرسل |
| getUserSchedule | userId: number | Promise<any[]> | 143-155 | جلب جدول المستخدم |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 48-49
INSERT INTO competition_reminders (competition_id, user_id, remind_at, created_at) VALUES (?, ?, ?, ?)
```

```sql
-- سطر 75
SELECT 1 FROM competition_reminders WHERE competition_id = ? AND user_id = ?
```

```sql
-- سطر 95
DELETE FROM competition_reminders WHERE competition_id = ? AND user_id = ?
```

```sql
-- سطر 104-111
SELECT r.*, c.title as competition_title, c.scheduled_at, u.username as creator_username FROM competition_reminders r JOIN competitions c ON r.competition_id = c.id JOIN users u ON c.creator_id = u.id WHERE r.user_id = ? AND r.sent = 0 ORDER BY r.remind_at ASC LIMIT ?
```

```sql
-- سطر 121-128
SELECT r.*, c.title as competition_title, c.scheduled_at, u.username as creator_username FROM competition_reminders r JOIN competitions c ON r.competition_id = c.id JOIN users u ON c.creator_id = u.id WHERE r.sent = 0 AND r.remind_at <= ? ORDER BY r.remind_at ASC LIMIT 100
```

```sql
-- سطر 144-152
SELECT c.*, cat.name_ar as category_name_ar, cat.name_en as category_name_en, CASE WHEN c.creator_id = ? THEN 1 ELSE 0 END as is_creator FROM competitions c LEFT JOIN categories cat ON c.category_id = cat.id WHERE (c.creator_id = ? OR c.opponent_id = ?) AND c.scheduled_at IS NOT NULL AND c.scheduled_at >= datetime('now') ORDER BY c.scheduled_at ASC
```

### الاستيرادات (Imports)
- `[D1Database]` from `@cloudflare/workers-types` - نوع قاعدة بيانات D1
- `[BaseModel]` from `./base/BaseModel` - فئة النموذج الأساسية

### ملاحظات
- التذكيرات تُرسل عندما تصل إلى وقت remind_at
- لا يمكن إضافة نفس التذكير مرتين لنفس المستخدم والمنافسة
- getUserSchedule جلب المنافسات المجدولة للمستخدم كمنشئ أو خصم

---

## الملف: src/models/SearchModel.ts

### الغرض العام
 نموذج SearchModel يتعامل مع البحث والاكتشاف في منصة Dueli. يوفر النموذج دوال شاملة للبحث في المنافسات والمستخدمين، بالإضافة إلى جلب المنافسات الشائعة والمباشرة والمنتظرة لخصم. يدعم النظام تصفية النتائج حسب الفئة واللغة والبلد والكلمات المفتاحية، كما يوفر نظام اقتراحات ذكي يعتمد على تفضيلات المستخدم (اللغة والبلد).

### الكلاس/الواجهات

#### SearchFilters (سطر 13-22)
- **النوع:** interface
- **الغرض:** واجهة تصفية البحث

#### SearchResult<T> (سطر 27-31)
- **النوع:** interface
- **الغرض:** واجهة نتيجة البحث

#### SearchModel (سطر 37-365)
- **النوع:** class
- **الوراثة:** لا يرث من BaseModel
- **الغرض:** نموذج البحث والاكتشاف

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| searchCompetitions | filters: SearchFilters | Promise<SearchResult<Competition>> | 47-123 | البحث في المنافسات |
| searchUsers | query: string, limit: number, offset: number | Promise<SearchResult<User>> | 128-171 | البحث في المستخدمين |
| getSuggestedCompetitions | userId: number \| null, language: string, country: string, limit: number | Promise<Competition[]> | 177-231 | جلب المنافسات المقترحة |
| getSuggestedUsers | userId: number, language: string, country: string, limit: number | Promise<User[]> | 237-270 | جلب المستخدمين المقترحين |
| getTrendingCompetitions | limit: number | Promise<Competition[]> | 275-296 | جلب المنافسات الشائعة |
| getLiveCompetitions | limit: number, offset: number | Promise<SearchResult<Competition>> | 301-330 | جلب المنافسات المباشرة |
| getPendingCompetitions | limit: number, offset: number | Promise<SearchResult<Competition>> | 335-364 | جلب المنافسات المنتظرة |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 54-56
(c.title LIKE ? OR c.description LIKE ?)
```

```sql
-- سطر 97-111
SELECT c.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar_url as creator_avatar, cat.name_ar as category_name_ar, cat.name_en as category_name_en, cat.slug as category_slug FROM competitions c LEFT JOIN users u ON c.creator_id = u.id LEFT JOIN categories cat ON c.category_id = cat.id ${whereClause} ORDER BY c.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 132-135
SELECT COUNT(*) as total FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND is_active = 1
```

```sql
-- سطر 142-159
SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.country, u.language, u.is_verified, u.total_competitions, u.total_wins, u.average_rating, u.created_at, (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count, (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count, CASE WHEN EXISTS (SELECT 1 FROM competitions c WHERE (c.creator_id = u.id OR c.opponent_id = u.id) AND c.status = 'live') THEN 1 ELSE 0 END as is_busy FROM users u WHERE (u.username LIKE ? OR u.display_name LIKE ?) AND u.is_active = 1 ORDER BY u.total_competitions DESC, u.average_rating DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 198-223
SELECT c.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar_url as creator_avatar, cat.name_ar as category_name_ar, cat.name_en as category_name_en, cat.slug as category_slug, CASE WHEN c.language = ? AND c.country = ? THEN 3 WHEN c.language = ? THEN 2 WHEN c.country = ? THEN 1 ELSE 0 END as relevance_score FROM competitions c LEFT JOIN users u ON c.creator_id = u.id LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.status IN ('pending', 'live') ORDER BY relevance_score DESC, c.status = 'live' DESC, c.total_views DESC, c.created_at DESC LIMIT ?
```

```sql
-- سطر 243-262
SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio, u.country, u.language, u.total_competitions, u.total_wins, u.average_rating, CASE WHEN u.language = ? AND u.country = ? THEN 3 WHEN u.language = ? THEN 2 WHEN u.country = ? THEN 1 ELSE 0 END as relevance_score FROM users u WHERE u.id != ? AND u.id NOT IN (SELECT following_id FROM user_follows WHERE follower_id = ?) ORDER BY relevance_score DESC, u.total_competitions DESC, u.average_rating DESC LIMIT ?
```

```sql
-- سطر 276-291
SELECT c.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar_url as creator_avatar, cat.name_ar as category_name_ar, cat.name_en as category_name_en, cat.slug as category_slug FROM competitions c LEFT JOIN users u ON c.creator_id = u.id LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.status IN ('live', 'completed') AND c.created_at >= datetime('now', '-7 days') ORDER BY c.total_views DESC, c.total_comments DESC LIMIT ?
```

```sql
-- سطر 307-321
SELECT c.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar_url as creator_avatar, cat.name_ar as category_name_ar, cat.name_en as category_name_en, cat.slug as category_slug FROM competitions c LEFT JOIN users u ON c.creator_id = u.id LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.status = 'live' ORDER BY c.started_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 341-355
SELECT c.*, u.username as creator_username, u.display_name as creator_display_name, u.avatar_url as creator_avatar, cat.name_ar as category_name_ar, cat.name_en as category_name_en, cat.slug as category_slug FROM competitions c LEFT JOIN users u ON c.creator_id = u.id LEFT JOIN categories cat ON c.category_id = cat.id WHERE c.status = 'pending' AND c.opponent_id IS NULL ORDER BY c.created_at DESC LIMIT ? OFFSET ?
```

### الاستيرادات (Imports)
- `[D1Database]` from `@cloudflare/workers-types` - نوع قاعدة بيانات D1
- `[Competition, User]` from `../config/types` - أنواع البيانات

### ملاحظات
- نتيجة البحث تتضمن total و hasMore للتصفح
- الاقتراحات تعتمد على اللغة والبلد مع أولوية (نسبة صلة)
- المنافسات الشائعة تُحسب خلال آخر 7 أيام

---

## الملف: src/models/SessionModel.ts

### الغرض العام
 نموذج SessionModel يتعامل مع إدارة جلسات المستخدمين في منصة Dueli. يوفر النموذج دوال لإنشاء الجلسات والتحقق منها وإنهائها. الجلسات تستخدم معرفات UUID نصية (وليس رقمية) ولذلك لا يرث من BaseModel. تنتهي صلاحية الجلسات بعد 30 يوماً ويتم تنظيف الجلسات المنتهية تلقائياً.

### الكلاس/الواجهات

#### SessionModel (سطر 12-107)
- **النوع:** class
- **الوراثة:** لا يرث من BaseModel
- **الغرض:** نموذج إدارة الجلسات

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findBySessionId | sessionId: string | Promise<Session \| null> | 29-34 | البحث عن جلسة بالمعرف |
| findValidSession | sessionId: string | Promise<{ session: Session; user: any } \| null> | 39-53 | البحث عن جلسة صالحة مع المستخدم |
| create | data: Partial<Session> | Promise<Session> | 58-68 | إنشاء جلسة جديدة |
| update | id: number, data: Partial<Session> | Promise<Session \| null> | 73-76 | تحديث جلسة (غير مستخدم) |
| deleteBySessionId | sessionId: string | Promise<boolean> | 81-86 | حذف جلسة بالمعرف |
| deleteByUser | userId: number | Promise<number> | 91-96 | حذف جميع جلسات المستخدم |
| cleanExpired | () | Promise<number> | 101-106 | تنظيف الجلسات المنتهية |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 31-32
SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")
```

```sql
-- سطر 41-42
SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")
```

```sql
-- سطر 48
SELECT * FROM users WHERE id = ?
```

```sql
-- سطر 63-64
INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, datetime('now'))
```

```sql
-- سطر 83
DELETE FROM sessions WHERE id = ?
```

```sql
-- سطر 93
DELETE FROM sessions WHERE user_id = ?
```

```sql
-- سطر 103
DELETE FROM sessions WHERE expires_at < datetime("now")
```

### الاستيرادات (Imports)
- `[Session]` from `../config/types` - نوع بيانات الجلسة

### ملاحظات
- الجلسات تستخدم معرفات UUID نصية
- صلاحية الجلسة 30 يوماً
- يمكن حذف جميع جلسات المستخدم عند تسجيل الخروج من كل الأجهزة

---

## الملف: src/models/UserModel.ts

### الغرض العام
 نموذج UserModel يتعامل مع إدارة المستخدمين في منصة Dueli. يوفر النموذج دوال شاملة للتحقق من وجود المستخدمين وتسجيلهم وتسجيل دخولهم عبر OAuth. يدعم النظام التحقق من البريد الإلكتروني وإرسال روابط إعادة تعيين كلمة المرور وتحديث بيانات المستخدم. يتضمن النموذج دوال للبحث عن المستخدمين بالبريد الإلكتروني ومعرف OAuth ورمز التحقق.

### الكلاس/الواجهات

#### CreateUserData (سطر 14-26)
- **النوع:** interface
- **الغرض:** واجهة إنشاء مستخدم

#### UpdateUserData (سطر 31-38)
- **النوع:** interface
- **الغرض:** واجهة تحديث المستخدم

#### UserModel (سطر 43-235)
- **النوع:** class
- **الوراثة:** extends BaseModel<User>
- **الغرض:** نموذج إدارة المستخدمين

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| findByEmail | email: string | Promise<User \| null> | 49-51 | البحث بالبريد الإلكتروني |
| findByUsername | username: string | Promise<User \| null> | 56-58 | البحث بمعرف المستخدم |
| findByOAuth | provider: string, oauthId: string | Promise<User \| null> | 63-68 | البحث بـ OAuth |
| findByVerificationToken | token: string | Promise<User \| null> | 73-75 | البحث برمز التحقق |
| findByResetToken | token: string | Promise<User \| null> | 80-85 | البحث برمز إعادة التعيين |
| emailExists | email: string | Promise<boolean> | 90-96 | التحقق من وجود البريد |
| usernameExists | username: string | Promise<boolean> | 101-107 | التحقق من وجود المعرف |
| create | data: CreateUserData | Promise<User> | 112-135 | إنشاء مستخدم جديد |
| update | id: number, data: UpdateUserData | Promise<User \| null> | 140-179 | تحديث بيانات المستخدم |
| verifyEmail | id: number | Promise<boolean> | 184-189 | التحقق من البريد |
| setVerificationToken | id: number, token: string, expiresAt: string | Promise<boolean> | 194-199 | تعيين رمز التحقق |
| setResetToken | id: number, token: string, expiresAt: string | Promise<boolean> | 204-209 | تعيين رمز إعادة التعيين |
| updatePassword | id: number, passwordHash: string | Promise<boolean> | 214-219 | تحديث كلمة المرور |
| findWithStats | username: string | Promise<User \| null> | 224-235 | جلب المستخدم مع الإحصائيات |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 50
SELECT * FROM users WHERE email = ?
```

```sql
-- سطر 57
SELECT * FROM users WHERE username = ?
```

```sql
-- سطر 65-66
SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?
```

```sql
-- سطر 82
SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime("now")
```

```sql
-- سطر 92
SELECT COUNT(*) as count FROM users WHERE email = ?
```

```sql
-- سطر 103
SELECT COUNT(*) as count FROM users WHERE username = ?
```

```sql
-- سطر 114-118
INSERT INTO users (email, username, display_name, password_hash, avatar_url, country, language, verification_token, verification_token_expires, oauth_provider, oauth_id, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
```

```sql
-- سطر 174-175
UPDATE users SET ${updates.join(', ')} WHERE id = ?
```

```sql
-- سطر 186
UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?
```

```sql
-- سطر 196
UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?
```

```sql
-- سطر 206
UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?
```

```sql
-- سطر 216
UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?
```

```sql
-- سطر 225-233
SELECT u.*, (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id) as total_competitions, (SELECT COUNT(*) FROM competitions WHERE (creator_id = u.id OR opponent_id = u.id) AND status = 'completed') as total_completed, (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count, (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count FROM users u WHERE u.username = ?
```

### الاستيرادات (Imports)
- `[BaseModel, QueryOptions]` from `./base/BaseModel` - فئة النموذج الأساسية
- `[User]` from `../config/types` - نوع بيانات المستخدم

### ملاحظات
- البريد الإلكتروني يُخزن بحروف صغيرة
- مستخدمو OAuth يُتحقق منهم تلقائياً
- findWithStats جلب إحصائيات المتابعين والمنافسات

---

## الملف: src/models/UserSettingsModel.ts

### الغرض العام
 نموذج UserSettingsModel يتعامل مع إدارة إعدادات المستخدمين ومنشوراتهم في منصة Dueli. يتضمن النموذج كلاسين: UserSettingsModel لإدارة إعدادات المستخدم و UserPostModel لإدارة منشورات المستخدم. يوفر النظام دوال لجلب وتحديث إعدادات المستخدم وكذلك إنشاء المنشورات وجلبها.

### الكلاس/الواجهات

#### UserSettings (سطر 13-23)
- **النوع:** interface
- **الغرض:** واجهة إعدادات المستخدم

#### UserPost (سطر 28-34)
- **النوع:** interface
- **الغرض:** واجهة منشور المستخدم

#### UserPostWithAuthor (سطر 39-43)
- **النوع:** interface
- **الغرض:** واجهة المنشور مع بيانات الكاتب

#### UserSettingsModel (سطر 49-146)
- **النوع:** class
- **الوراثة:** extends BaseModel<UserSettings>
- **الغرض:** نموذج إدارة إعدادات المستخدم

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<UserSettings> | Promise<UserSettings> | 59-80 | إنشاء إعدادات |
| update | id: number, data: Partial<UserSettings> | Promise<UserSettings \| null> | 85-121 | تحديث إعدادات |
| getByUserId | userId: number | Promise<UserSettings \| null> | 126-128 | جلب إعدادات بالمعرف |
| getOrCreate | userId: number | Promise<UserSettings> | 133-137 | جلب أو إنشاء إعدادات |
| updateByUserId | userId: number, data: Partial<UserSettings> | Promise<UserSettings \| null> | 142-145 | تحديث إعدادات بالمعرف |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 62-64
INSERT INTO user_settings (user_id, default_language, default_country, notifications_enabled, email_notifications, privacy_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

```sql
-- سطر 116-117
UPDATE user_settings SET ${updates.join(', ')} WHERE id = ?
```

```sql
-- سطر 127
SELECT * FROM user_settings WHERE user_id = ?
```

#### UserPostModel (سطر 152-228)
- **النوع:** class
- **الوراثة:** extends BaseModel<UserPost>
- **الغرض:** نموذج إدارة منشورات المستخدم

##### الدوال (Methods)
| الاسم | Parameters | Return | السطر | الغرض |
|-------|-----------|--------|-------|-------|
| create | data: Partial<UserPost> | Promise<UserPost> | 162-173 | إنشاء منشور |
| update | id: number, data: Partial<UserPost> | Promise<UserPost \| null> | 178-185 | تحديث منشور |
| getUserPosts | userId: number, limit: number, offset: number | Promise<UserPostWithAuthor[]> | 190-200 | جلب منشورات المستخدم |
| getFeed | userId: number, limit: number, offset: number | Promise<UserPostWithAuthor[]> | 205-217 | جلب آخر المنشورات |
| isOwner | postId: number, userId: number | Promise<boolean> | 222-227 | التحقق من الملكية |

##### الـ SQL Queries المستخدمة
```sql
-- سطر 165-166
INSERT INTO user_posts (user_id, content, image_url, created_at) VALUES (?, ?, ?, ?)
```

```sql
-- سطر 180-181
UPDATE user_posts SET content = ? WHERE id = ?
```

```sql
-- سطر 191-198
SELECT p.*, u.username, u.display_name, u.avatar_url FROM user_posts p JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT ? OFFSET ?
```

```sql
-- سطر 206-214
SELECT p.*