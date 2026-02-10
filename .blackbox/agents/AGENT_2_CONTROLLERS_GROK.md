# 🤖 وكيل 2: توثيق الكنترولرز (Controllers Agent)
# Agent 2: Controllers Documentation

**النموذج المقترح:** Grok Code Fast (سريع ومناسب للـ API endpoints)

---

## 📁 مهمتك

توثيق كل ملفات `src/controllers/` بالتفصيل.

**المسار:** `d:/projects/opus-dueli/webapp/src/controllers/`

**الملفات المطلوبة (12 ملف):**
```
src/controllers/
├── base/BaseController.ts     ← ⚠️ مهم جداً - الأساس
├── AdminController.ts
├── AuthController.ts
├── CategoryController.ts
├── CompetitionController.ts   ← ⚠️ مهم جداً - قلب المنصة
├── index.ts
├── InteractionController.ts
├── MessageController.ts
├── ScheduleController.ts
├── SearchController.ts
├── SettingsController.ts
└── UserController.ts
```

---

## 📝 تنسيق التوثيق المطلوب

```markdown
## الملف: [المسار الكامل]

### الغرض العام
[الـ endpoints اللي بيخدمها]

### الـ API Endpoints

#### [اسم الدالة] (سطر [بداية]-[نهاية])
- **الـ Endpoint:** `METHOD /path`
- **الـ Controller:** [اسم الكلاس]
- **الـ Middleware:** [middlewares المستخدمة]

##### الـ Request
```typescript
// Body
{
  field1: type,
  field2: type
}

// Query Parameters
?param1=value&param2=value

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: { ... }
}

// Error (4xx/5xx)
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "..."
  }
}
```

##### المنطق الرئيسي
1. [خطوة 1]
2. [خطوة 2]
3. [خطوة 3]

##### الـ Models المستدعاة
- [ModelName.method] - الغرض

### الـ Validation
- [الحقول المطلوبة]
- [أنواع البيانات]
- [القيود]

### الـ Error Handling
- [أنواع الأخطاء المحتملة]
- [كود الخطأ]
```

---

## 📤 مكان إخراج النتيجة

**أنشئ ملف:** `d:/projects/opus-dueli/webapp/.blackbox/docs/04-controllers-documentation.md`

---

## ⏱️ الوقت المتوقع

**6-8 ساعات** للـ 12 ملف.

---

## ✅ قائمة التحقق

- [ ] وثقت كل endpoint بالتفصيل
- [ ] حددت method, path, parameters
- [ ] وثقت الـ request/response
- [ ] سجلت الـ Models المستدعاة
- [ ] حددت الـ validation rules
- [ ] أنشأت ملف `04-controllers-documentation.md`

---

**ابدأ فوراً. اكتب بالعربي الفصحى المبسط.**
