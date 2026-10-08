# قاتي بزنس — تطبيق Flutter (Offline-First)

تطبيق المقوّت لتسجيل البيع والشراء والسندات داخل السوق، يعمل بالكامل بدون إنترنت
ويزامن تلقائياً مع الواجهة الخلفية عند توفر الشبكة.

## البنية

```
lib/
  main.dart                     نقطة البداية + RTL + الثيم + توجيه الدخول
  core/
    api_client.dart             عميل REST (Dio) يحقن JWT تلقائياً
    local_store.dart            SQLite: جدول outbox + كاش (الأطراف، أنواع القات)
    sync_service.dart           مزامنة خلفية: /sync/batch ثم /sync/pull
    printing_service.dart       طباعة إيصال حراري عبر بلوتوث (ESC/POS)
  features/
    login_screen.dart           تسجيل الدخول بالجوال وكلمة المرور
    home_shell.dart             شريط تنقل + زر مزامنة يدوي
    pos_screen.dart             نقطة بيع سريعة: شرائح أنواع + لوحة أرقام + طباعة الإيصال
    debts_screen.dart           الديون، سند قبض/صرف، كشف حساب + واتساب
    settings_screen.dart        حالة المزامنة، تغيير كلمة المرور، تسجيل الخروج
    print_receipt_sheet.dart    اختيار طابعة بلوتوث وطباعة الإيصال
```

## إدارة الحالة

Riverpod (`Provider` / `StateProvider`) عبر `apiClientProvider`، `localStoreProvider`،
`syncServiceProvider`، و`pendingCountProvider` لعرض عدد العمليات غير المتزامنة.

## آلية العمل بدون إنترنت

1. كل عملية (بيع، شراء، سند) تُكتب في جدول `outbox` مع `clientUuid` فريد وحالة `pending`.
2. `SyncService` يستمع لتغيّر الاتصال (`connectivity_plus`) ويعمل أيضاً كل دقيقتين.
3. يرسل كامل الطابور إلى `POST /api/v1/sync/batch`؛ الخادم يرجع لكل عملية
   `applied` أو `duplicate` أو `failed` — ويتم تعليم المطبّقة والمكررة كـ `synced`.
4. ثم ينفذ `GET /api/v1/sync/pull?since=` لتحديث الكاش المحلي ويحفظ `serverTime`.

## التشغيل

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=https://your-backend-host
```

## الطباعة

`PrintingService.scan()` يعرض الطابعات القريبة، ثم `select()` و`printReceipt()`
لطباعة إيصال 80mm يطابق تخطيط الإيصال في واجهة الويب.
