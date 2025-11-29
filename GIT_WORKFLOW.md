# 🔀 Dueli Git Workflow - إدارة النسخ والإصدارات

**تاريخ الإنشاء**: 2025-11-29 13:58:30

---

## 🎯 الهدف

نظام Git workflow يسمح بـ:
- ✅ تتبع جميع التعديلات
- ✅ التراجع بسهولة عن أي تغيير
- ✅ العمل على ميزات متعددة بشكل منفصل
- ✅ إصدارات مستقرة للإنتاج

---

## 🌳 استراتيجية الـ Branches

### الـ Branches الرئيسية

```
main (production)
  ↑
  └── develop (development)
       ↑
       ├── feature/jitsi-integration
       ├── feature/ui-updates
       ├── feature/auth-system
       └── hotfix/search-bug
```

#### 1. `main` - الإنتاج
- **الغرض**: الكود المنشور والمستقر فقط
- **الحماية**: لا commits مباشرة، فقط merges من `develop`
- **المنشور على**: https://project-8e7c178d.pages.dev/

#### 2. `develop` - التطوير
- **الغرض**: آخر الميزات المكتملة والجاهزة للاختبار
- **من أين يأتي**: merges من `feature/*` branches
- **المنشور على**: https://dev.dueli.pages.dev/ (اختياري)

#### 3. `feature/*` - الميزات الجديدة
- **الغرض**: تطوير ميزة واحدة محددة
- **التسمية**: `feature/اسم-الميزة`
- **أمثلة**:
  - `feature/jitsi-integration`
  - `feature/youtube-recording`
  - `feature/ui-header-update`
  - `feature/email-verification`

#### 4. `hotfix/*` - إصلاحات عاجلة
- **الغرض**: إصلاح خطأ في الإنتاج
- **التسمية**: `hotfix/اسم-المشكلة`
- **يُدمج في**: `main` و `develop` معاً

---

## 📋 سير العمل (Workflow)

### سيناريو 1: إضافة ميزة جديدة

```bash
# 1. التأكد من أنك على develop
git checkout develop
git pull origin develop

# 2. إنشاء branch جديد للميزة
git checkout -b feature/jitsi-integration

# 3. العمل على الميزة
# ... تعديل الملفات ...

# 4. Commit التعديلات
git add .
git commit -m "feat: Add Jitsi Meet integration

- Added Jitsi IFrame API
- Created stream management endpoints
- Updated competition room UI

Refs #123"

# 5. Push للـ GitHub
git push origin feature/jitsi-integration

# 6. فتح Pull Request على GitHub
# من: feature/jitsi-integration
# إلى: develop

# 7. بعد المراجعة والموافقة: Merge
git checkout develop
git merge feature/jitsi-integration
git push origin develop

# 8. حذف الـ branch (اختياري)
git branch -d feature/jitsi-integration
git push origin --delete feature/jitsi-integration
```

### سيناريو 2: إصلاح خطأ عاجل في الإنتاج

```bash
# 1. إنشاء hotfix من main
git checkout main
git pull origin main
git checkout -b hotfix/search-input-spacing

# 2. إصلاح المشكلة
# ... تعديل الملفات ...

# 3. Commit
git add .
git commit -m "fix: Fix search input icon spacing

The search icon was overlapping text input.
Added proper margin-left spacing.

Fixes #456"

# 4. Merge في main
git checkout main
git merge hotfix/search-input-spacing
git push origin main

# 5. Merge في develop أيضاً
git checkout develop
git merge hotfix/search-input-spacing
git push origin develop

# 6. حذف الـ hotfix branch
git branch -d hotfix/search-input-spacing
```

### سيناريو 3: إصدار جديد (Release)

```bash
# 1. عندما develop جاهز للنشر
git checkout develop
git pull origin develop

# 2. Merge في main
git checkout main
git merge develop

# 3. إنشاء tag للإصدار
git tag -a v1.0.0-beta -m "Beta Release 1.0.0

Features:
- Jitsi integration
- UI updates
- Email verification

Date: 2026-02-28"

# 4. Push مع الـ tags
git push origin main --tags

# 5. Deploy تلقائي على Cloudflare Pages
```

---

## 📝 Commit Message Guidelines

### الصيغة

```
<type>: <subject>

<body>

<footer>
```

### الأنواع (Types)

| النوع | الاستخدام | مثال |
|-------|----------|------|
| `feat` | ميزة جديدة | `feat: Add Jitsi streaming` |
| `fix` | إصلاح خطأ | `fix: Fix search input spacing` |
| `docs` | توثيق | `docs: Update README` |
| `style` | تنسيق الكود | `style: Format code with Prettier` |
| `refactor` | إعادة هيكلة | `refactor: Extract auth logic` |
| `test` | اختبارات | `test: Add unit tests for auth` |
| `chore` | مهام صيانة | `chore: Update dependencies` |

### أمثلة جيدة

```bash
# ميزة جديدة
git commit -m "feat: Implement YouTube recording integration

- Added YouTube Data API v3 client
- Created auto-upload function after stream ends
- Saved video URL to database

Closes #45"

# إصلاح خطأ
git commit -m "fix: Resolve competition card overlap on mobile

Cards were overlapping on screens < 768px.
Updated CSS grid template columns.

Fixes #78"

# توثيق
git commit -m "docs: Add Jitsi setup guide to README

Step-by-step instructions for:
- Installing Jitsi locally
- Cloudflare Tunnel setup
- YouTube API configuration"
```

### أمثلة سيئة (تجنبها)

```bash
# ❌ غير واضح
git commit -m "update"

# ❌ عام جداً
git commit -m "fix bugs"

# ❌ بدون سياق
git commit -m "changes"

# ✅ الأفضل
git commit -m "fix: Resolve login redirect loop in Safari"
```

---

## 🏷️ Tagging Versions

### صيغة الإصدارات (Semantic Versioning)

```
vMAJOR.MINOR.PATCH
```

- **MAJOR**: تغييرات كبيرة (breaking changes)
- **MINOR**: ميزات جديدة (backwards compatible)
- **PATCH**: إصلاحات (bug fixes)

### أمثلة

```bash
# Beta releases
v0.1.0-beta  # أول beta
v0.2.0-beta  # beta مع ميزات جديدة
v0.2.1-beta  # beta مع إصلاحات

# Production releases
v1.0.0  # أول إصدار production
v1.1.0  # ميزة جديدة
v1.1.1  # إصلاح خطأ
v2.0.0  # تغيير كبير (breaking)
```

### إنشاء Tag

```bash
# Tag بسيط
git tag v0.1.0-beta

# Tag مع رسالة
git tag -a v0.1.0-beta -m "First Beta Release

Features:
- Jitsi integration complete
- Basic UI updates
- Email verification working

Known Issues:
- YouTube upload may be slow
- Some UI elements need polish"

# Push الـ tags
git push origin --tags
```

---

## 🔄 التراجع عن التعديلات

### التراجع عن آخر commit (قبل push)

```bash
# إلغاء آخر commit لكن الاحتفاظ بالتعديلات
git reset --soft HEAD~1

# إلغاء آخر commit والتعديلات معاً
git reset --hard HEAD~1
```

### التراجع عن commit مرفوع (بعد push)

```bash
# إنشاء commit جديد يعكس التعديلات
git revert <commit-hash>

# مثال
git revert a1b2c3d
git push origin develop
```

### العودة لنسخة قديمة كاملة

```bash
# معرفة الـ commits السابقة
git log --oneline

# العودة لـ commit معين
git checkout <commit-hash>

# إذا أردت الاحتفاظ بهذه النسخة
git checkout -b backup-2025-11-29
git push origin backup-2025-11-29
```

### استرجاع ملف معين من commit قديم

```bash
# استرجاع ملف واحد
git checkout <commit-hash> -- path/to/file.ts

# مثال
git checkout a1b2c3d -- src/index.tsx
```

---

## 🛡️ GitHub Protection Rules

### حماية `main` branch

```yaml
Settings → Branches → Add rule

Branch name pattern: main

Protections:
✅ Require pull request reviews before merging
✅ Require status checks to pass before merging
✅ Require branches to be up to date before merging
✅ Include administrators
```

### حماية `develop` branch

```yaml
Branch name pattern: develop

Protections:
✅ Require pull request reviews (optional)
✅ Require status checks to pass
```

---

## 📤 Pull Request Template

إنشاء `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## الوصف
<!-- صف التعديلات بإيجاز -->

## نوع التعديل
- [ ] ميزة جديدة (feature)
- [ ] إصلاح خطأ (bug fix)
- [ ] تحسين الأداء (performance)
- [ ] إعادة هيكلة (refactor)
- [ ] توثيق (documentation)

## الاختبارات
<!-- كيف اختبرت التعديلات؟ -->
- [ ] اختبار محلي
- [ ] اختبار على Chrome
- [ ] اختبار على Firefox
- [ ] اختبار على موبايل
- [ ] اختبار العربية والإنجليزية

## Screenshots
<!-- إذا كانت هناك تعديلات UI -->

## Checklist
- [ ] الكود يتبع الـ style guide
- [ ] التعديلات موثّقة
- [ ] لا errors في الـ console
- [ ] تم تحديث ROADMAP.md إذا لزم الأمر
```

---

## 🚀 الخطوات التالية

### إعداد Git للمشروع

```bash
# 1. التأكد من أنك في مجلد المشروع
cd d:\projects\opus-dueli\webapp

# 2. التحقق من الـ remote
git remote -v

# 3. إنشاء develop branch
git checkout -b develop
git push origin develop

# 4. حماية الـ branches على GitHub
# (اتبع الخطوات في القسم أعلاه)

# 5. إنشاء أول feature branch
git checkout -b feature/jitsi-setup
```

### workflow اليومي الموصى به

```bash
# كل صباح
git checkout develop
git pull origin develop

# للعمل على ميزة
git checkout -b feature/new-feature
# ... عمل ...
git add .
git commit -m "feat: description"
git push origin feature/new-feature
# ... فتح PR على GitHub ...

# بعد merge الـ PR
git checkout develop
git pull origin develop
git branch -d feature/new-feature
```

---

**آخر تحديث**: 2025-11-29 13:58:30
