# 🤖 وكيل 6: توثيق Lib & Config (Lib Agent)
# Agent 6: Lib, Config, Middleware, i18n Documentation

**النموذج المقترح:** Arcee AI: Trinity Large Preview (مناسب للـ utilities والـ config)

---

## 📁 مهمتك

توثيق ملفات `src/lib/` + `src/config/` + `src/middleware/` + `src/i18n/`.

**المسارات:**
- `d:/projects/opus-dueli/webapp/src/lib/`
- `d:/projects/opus-dueli/webapp/src/config/`
- `d:/projects/opus-dueli/webapp/src/middleware/`
- `d:/projects/opus-dueli/webapp/src/i18n/`

**الملفات (25+ ملف):**

### src/lib/
```
├── jitsi-config.ts
├── oauth/
│   ├── BaseOAuthProvider.ts   ← ⚠️ مهم - OAuth base
│   ├── facebook.ts
│   ├── google.ts              ← ⚠️ مهم - يعمل
│   ├── index.ts
│   ├── microsoft.ts           ← ⚠️ مهم - يعمل
│   ├── OAuthProviderFactory.ts ← ⚠️ مهم
│   ├── tiktok.ts              ← ⚠️ غير مكتمل؟
│   ├── types.ts
│   └── utils.ts
└── services/
    ├── CryptoUtils.ts
    ├── EmailService.ts
    └── index.ts
```

### src/config/
```
├── defaults.ts
├── pwa.ts
└── types.ts
```

### src/middleware/
```
├── auth.ts                    ← ⚠️ مهم - Auth middleware
└── index.ts
```

### src/i18n/
```
├── ar.ts                      ← ⚠️ مهم - Arabic
├── en.ts                      ← ⚠️ مهم - English
└── index.ts
```

---

## 📝 تنسيق التوثيق

### للـ OAuth Providers:

```markdown
## الملف: [المسار]

### النوع
OAuth Provider | Utility | Config | Middleware | Translation

### الغرض
[شرح]

### الـ Class/Interface
| الاسم | النوع | الغرض |
|-------|-------|-------|
| GoogleOAuth | class | مصادقة Google |

### الـ Methods
| الاسم | Parameters | Return | الغرض |
|-------|-----------|--------|-------|
| getAuthUrl | redirectUri | string | رابط المصادقة |

### الـ OAuth Flow
1. [خطوة 1]
2. [خطوة 2]
3. [خطوة 3]

### الحالة
- [x] يعمل | [ ] غير مكتمل | [ ] يحتاج اختبار
```

### للـ Middleware:

```markdown
## الملف: [المسار]

### الغرض
[شرح]

### الـ Middleware Function
```typescript
// التوقيع
function middleware(c: Context, next: Next): Promise<Response>

// المنطق
1. [خطوة 1]
2. [خطوة 2]
```

### الاستخدام
- [أين يُستخدم؟]
```

### للـ i18n:

```markdown
## الملف: [المسار]

### اللغة
Arabic | English

### عدد المفاتيح
[العدد]

### الـ Categories الرئيسية
- auth: [عدد] مفتاح
- competitions: [عدد] مفتاح
- ...

### ملاحظات
- [أي ملاحظات]
```

---

## 📤 مكان إخراج النتيجة

**أنشئ ملف:** `d:/projects/opus-dueli/webapp/.blackbox/docs/08-lib-config-documentation.md`

---

## ⏱️ الوقت المتوقع

**4-6 ساعات**.

---

## ✅ قائمة التحقق

- [ ] وثقت كل OAuth provider
- [ ] حددت: أي provider يعمل؟ أي غير مكتمل؟
- [ ] وثقت الـ middleware
- [ ] وثقت الـ i18n files
- [ ] وثقت الـ config
- [ ] أنشأت ملف `08-lib-config-documentation.md`

---

**ابدأ فوراً.**
