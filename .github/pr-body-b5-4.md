# fix(core): close competition invite/accept loop and make opponent assignment race-safe

## النتيجة للمستخدم
A ينشئ منافسة → يدعو B → B يقبل → يصبح B الخصم نهائياً. لا يستطيع C اختطاف المقعد (قبول متزامن ثانٍ → 409)، ولا تبقى دعوات/طلبات معلقة متضاربة بعد القبول.

## الملفات المعدلة وسبب كل ملف
- `src/models/CompetitionModel.ts` — `setOpponent()` تعيد الآن `boolean` من `meta.changes > 0` بدل `true` دائماً؛ SQL كما هو (`AND opponent_id IS NULL` كانت موجودة، الحارس أصبح مرئياً للمستدعين).
- `src/controllers/CompetitionController.ts` — `acceptInvitation()`: قبول ذري داخل `db.batch()` واحد (ضبط opponent_id + status='accepted' + رفض بقية الدعوات المعلقة لنفس المنافسة)؛ `setOpponent()===false` (سباق) → 409 `competition_errors.opponent_already_set`. `acceptRequest()`: معالجة false بنفس المفتاح. `invite()`: الحظر → 403 `competition_errors.blocked_user`؛ دعوة مكررة pending → 409.
- `src/i18n/ar.ts` / `src/i18n/en.ts` — `competition_errors.opponent_already_set` (تم تعيين الخصم بالفعل / An opponent has already been set)، `invitation_not_found` (الدعوة غير موجودة أو منتهية / Invitation not found or expired)، `blocked_user` (لا يمكن التفاعل مع هذا المستخدم / You cannot interact with this user).
- `tests/api/competition-invite-accept.test.ts` — جديد، 6 اختبارات (كُتبت حمراء أولاً).
- `tests/helpers/fake-d1.ts` — دعم `competition_invitations` + `notifications` + `batch()` (للاختبارات فقط، لا منطق إنتاج).
- `WORKLOG.md` / `PLAN-STATUS.md` — التوثيق.

## الاختبار الأحمر (قبل الإصلاح)
```
✗ 1. invite→accept: opponent_id=B, status=accepted
✗ 2. Race: B and C accept concurrently — المتوقع [200, 409]، الفعلي [200, 200]، وopponent_id متضارب (آخر كاتب يفوز)
✗ 3. After B accepts, no pending invitations remain — بقيت pending
✗ 4/5/6 فشلت أيضاً (403 بنص حرفي، رسالة غير مترجمة، غياب إشعار القبول)
```
بعد الإصلاح: 6/6 ✅.

## نتائج التحقق
- `npx vitest run tests/api/competition-invite-accept.test.ts` → 6/6 ✅
- `npm test` → 76/76 ✅ (11 ملفات)
- `npx tsc --noEmit` → نظيف ✅
- `npm run build` → ناجح ✅
- اختبار السباق المتكرر ×10 → 10/10 (200/409، opponent ثابت، بلا flakiness)

## مفاتيح i18n (ar + en)
opponent_already_set · invitation_not_found · blocked_user — داخل `competition_errors` في الملفين.

## ما لم يُلمس
matchmaking · LivePayoutEngine · أي منطق مالي · ads · migrations · `src/modules/api/competitions/routes.ts` (بقي HTTP wiring فقط) · إشعارات invite/accept الحالية (أُعيد استخدامها كما هي).

## خطة التراجع
`git revert` للـcommit الوحيد على هذا الفرع؛ لا migrations ولا تغييرات schema — التراجع آمن كلياً.
