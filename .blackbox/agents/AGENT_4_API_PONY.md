# 🤖 وكيل 4: توثيق API Routes (API Agent)
# Agent 4: API Routes Documentation

**النموذج المقترح:** Pony Alpha (مناسب للـ routing والـ endpoints)

---

## 📁 مهمتك

توثيق كل ملفات `src/modules/api/` التي تحتوي على الـ routes.

**المسار:** `d:/projects/opus-dueli/webapp/src/modules/api/`

**الملفات المطلوبة (20+ ملف):**
```
src/modules/api/
├── admin/routes.ts
├── auth/
│   ├── helpers.ts
│   ├── oauth-routes.ts      ← ⚠️ مهم - OAuth
│   └── routes.ts
├── categories/routes.ts
├── chunks/routes.ts         ← ⚠️ مهم - Streaming
├── competitions/routes.ts   ← ⚠️ مهم جداً
├── countries/routes.ts
├── jitsi/index.ts
├── likes/routes.ts
├── messages/routes.ts
├── notifications/routes.ts
├── reports/routes.ts
├── schedule/routes.ts
├── search/routes.ts
├── seed/routes.ts
├── settings/routes.ts
├── signaling/
│   ├── routes.ts            ← ⚠️ مهم جداً - P2P
│   └── routes_backup.ts
└── users/routes.ts
```

---

## 📝 تنسيق التوثيق

```markdown
## الملف: [المسار]

### الـ Base URL
[مثلاً: /api/competitions]

### الـ Routes

#### [METHOD /path] (سطر [بداية]-[نهاية])
- **الـ Handler:** [اسم الدالة]
- **الـ Controller:** [Controller.method]
- **الـ Middleware:** [middlewares]

##### الـ Request
```typescript
// Body
{ ... }

// Query Parameters
?param=value

// Headers
{ ... }
```

##### الـ Response
```typescript
// Success
{ ... }

// Error
{ ... }
```

##### الوصف
[ما الذي يفعله هذا الـ endpoint؟]

### الـ Controllers المرتبطة
- [ControllerName] - [الغرض]

### الـ Middleware المشتركة
- [middleware name] - [الغرض]
```

---

## 📤 مكان إخراج النتيجة

**أنشئ ملف:** `d:/projects/opus-dueli/webapp/.blackbox/docs/06-api-routes-documentation.md`

---

## ⏱️ الوقت المتوقع

**6-8 ساعات**.

---

## ✅ قائمة التحقق

- [ ] وثقت كل route بالتفصيل
- [ ] حددت method, path, handler
- [ ] وثقت الـ middleware المستخدم
- [ ] ربطت كل route بـ controller
- [ ] أنشأت ملف `06-api-routes-documentation.md`

---

**ابدأ فوراً.**
