# اختبار البث المباشر - Stream Testing Workflow
# turbo-all

## بيانات الاختبار:
- **Host**: `host@test.dueli` / `TestHost123!`
- **Opponent**: `opponent@test.dueli` / `TestOppo123!`
- **رابط المنصة**: `https://project-8e7c178d.pages.dev`

## الخطوات:

### 1. تسجيل دخول Host (أنا)
```javascript
// فتح المنصة
open: https://project-8e7c178d.pages.dev/?lang=ar
// ضغط زر "دخول"
// إدخال: host@test.dueli
// إدخال: TestHost123!
// ضغط "تسجيل الدخول"
```

### 2. إنشاء منافسة
```javascript
// ضغط زر "إنشاء منافسة"
// العنوان: Test Stream Competition
// الوصف: اختبار نظام البث
// اختيار قسم
// ضغط "إنشاء"
// حفظ رقم المنافسة من URL
```

### 3. Opponent يطلب الانضمام (المستخدم)
```
// نافذة خفية
// فتح: https://project-8e7c178d.pages.dev/?lang=ar
// تسجيل دخول: opponent@test.dueli / TestOppo123!
// الذهاب لصفحة المنافسة
// ضغط "طلب الانضمام"
```

### 4. قبول الطلب (Host)
```javascript
// العودة لصفحة المنافسة
// ضغط الموافقة على الطلب
```

### 5. بدء البث
```
// Host: ضغط "مباشر" أو "بدء البث"
// Opponent: ضغط "مباشر" أو "بدء البث"
// مراقبة Console للأخطاء
```

## ملاحظات للتشغيل السريع:
- استخدم JavaScript مباشرة للتعبئة: `document.querySelector('input').value = 'test'`
- انتظر 2-3 ثواني بين كل خطوة
