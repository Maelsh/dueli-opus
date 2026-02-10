# 🤖 وكيل 7: توثيق Shared & Routes & Main (Shared Agent)
# Agent 7: Shared Components, Routes, and Main Documentation

**النموذج المقترح:** Gemini 3 Flash (مناسب للـ components والـ templates)

---

## 📁 مهمتك

توثيق ملفات `src/shared/` + `src/routes/` + `src/main.ts`.

**المسارات:**
- `d:/projects/opus-dueli/webapp/src/shared/`
- `d:/projects/opus-dueli/webapp/src/routes/`
- `d:/projects/opus-dueli/webapp/src/main.ts` ← ⚠️ مهم جداً

**الملفات (15+ ملف):**

### src/shared/
```
├── components/
│   ├── competition-card.ts    ← ⚠️ مهم - UI أساسي
│   ├── competition-section.ts ← ⚠️ مهم - UI أساسي
│   ├── footer.ts
│   ├── index.ts
│   ├── login-modal.ts         ← ⚠️ مهم - Auth UI
│   ├── navigation.ts          ← ⚠️ مهم - UI أساسي
│   └── user-card.ts
├── constants.ts
├── seed-data.ts
└── templates/
    └── layout.ts              ← ⚠️ مهم - Template أساسي
```

### src/routes/
```
├── api.ts                     ← ⚠️ مهم - API routes registration
├── index.ts                   ← ⚠️ مهم - Main routes
└── jitsi.ts
```

### src/main.ts
```
main.ts                        ← ⚠️ مهم جداً - App entry point
```

---

## 📝 تنسيق التوثيق

### للـ Components:

```markdown
## الملف: [المسار]

### الغرض
[UI Component | Template | Helper]

### الـ Props/Parameters
| الاسم | النوع | الغرض |
|-------|-------|-------|
| user | User | بيانات المستخدم |

### الـ HTML Structure
```html
<!-- ملخص الهيكل -->
<div class="component">
  ...
</div>
```

### الـ Functions
| الاسم | Parameters | Return | الغرض |
|-------|-----------|--------|-------|
| render | props | string (HTML) | رenders الـ component |

### الـ Dependencies
- يستدعي: [files]
- يُستدعى من: [files]
```

### للـ Routes:

```markdown
## الملف: [المسار]

### الغرض
[Routes registration]

### الـ Routes المسجلة
| الـ Pattern | Method | Handler | Controller |
|------------|--------|---------|------------|
| /api/* | ALL | apiRouter | - |

### الـ Middleware المشتركة
- [middleware name] - [الغرض]
```

### لـ main.ts (مهم جداً):

```markdown
## الملف: src/main.ts ⚠️ مهم جداً

### الغرض
[App entry point - initialization]

### ترتيب الـ Middleware (مهم!)
| الترتيب | الـ Middleware | الغرض |
|---------|---------------|-------|
| 1 | logger | تسجيل الطلبات |
| 2 | cors | CORS |
| ... | ... | ... |

### تسجيل الـ Routes
| الـ Route | الملف |
|-----------|-------|
| /api | routes/api.ts |
| / | routes/index.ts |

### الـ Cron Jobs (لو موجودة)
- [job name] - [schedule] - [الغرض]

### الـ Error Handling
- [كيف يتم التعامل مع الأخطاء؟]

### الـ App Initialization
```typescript
// خطوات التهيئة
1. [خطوة 1]
2. [خطوة 2]
```
```

---

## 📤 مكان إخراج النتيجة

**أنشئ ملف:** `d:/projects/opus-dueli/webapp/.blackbox/docs/09-shared-routes-documentation.md`

---

## ⏱️ الوقت المتوقع

**4-6 ساعات**.

---

## ✅ قائمة التحقق

- [ ] وثقت كل component بالتفصيل
- [ ] وثقت الـ routes registration
- [ ] وثقت main.ts بالتفصيل (مهم!)
- [ ] حددت ترتيب الـ middleware
- [ ] حددت الـ cron jobs
- [ ] أنشأت ملف `09-shared-routes-documentation.md`

---

**ابدأ فوراً. ركز على main.ts - هو الأهم.**
