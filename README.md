# قاتي بزنس — منصة SaaS متعددة المستأجرين لتجارة القات

منصة متكاملة (Backend + لوحة ويب Mobile-First + تطبيق Flutter) لإدارة بيع وشراء القات،
الموردين والعملاء، الديون وسندات القبض والصرف، حسابات الموظفين، واشتراكات المنصة.

## المعمارية

| الطبقة | التقنية |
| --- | --- |
| الواجهة الخلفية | Next.js (App Router) Route Handlers — بنية Modular Monolith تحت `src/app/api/v1` |
| قاعدة البيانات | PostgreSQL + Drizzle ORM (`src/db/schema.ts`) |
| المصادقة | JWT (HS256) يحمل `tenant_id` / `user_id` / `role` + bcrypt للتشفير |
| عزل المستأجرين | Query Scoping إجباري عبر `requireTenant()` في `src/lib/auth.ts` |
| التطبيق الجوال | Flutter + Riverpod + SQLite (مجلد `mobile/`) مع مزامنة أوفلاين |

### الوحدات (Modules)

```
src/middleware.ts               حارس الحافة: حماية /app وحقن ترويسات العزل
src/lib/auth.ts                 JWT + bcrypt + requireTenant/requireRole/requirePlatformAdmin
src/lib/services/trading.ts     المبيعات والمشتريات والسندات داخل معاملات ACID
src/lib/services/invoices.ts    تفاصيل الفواتير + إلغاء الفاتورة مع عكس القيود
src/lib/services/statements.ts  كشوفات الحساب والرصيد التراكمي
src/lib/services/reports.ts     لوحة المؤشرات اليومية + تقارير الفترات والأرباح
src/app/api/v1/auth/*           تسجيل/دخول التاجر والموظف والمشرف العام
src/app/api/v1/{customers,suppliers,qat-types}[/id]   CRUD كامل + إحصاءات + أرشفة
src/app/api/v1/{sales,purchases}[/id]                 إصدار/عرض/إلغاء الفواتير
src/app/api/v1/{vouchers,statements,transactions,reports,subscription,users}
src/app/api/v1/sync/{batch,pull}                      مزامنة التطبيق الجوال (idempotent)
src/app/api/v1/admin/{tenants,plans,subscriptions,stats}
```

### صفحات الويب (Mobile-First / RTL)

| الصفحة | الوظيفة |
| --- | --- |
| `/` | تسجيل دخول التاجر + تسجيل منشأة جديدة بفترة تجريبية |
| `/app` | لوحة المؤشرات: مبيعات اليوم، النقد المحصل، الذمم، رسم أسبوعي |
| `/app/pos` | نقطة بيع/شراء سريعة: شرائح أنواع القات، لوحة أرقام، طابور أوفلاين |
| `/app/invoices` | سجل الفواتير + إيصال حراري 80mm قابل للطباعة + إلغاء الفاتورة |
| `/app/debts` | ديون العملاء ومستحقات الموردين، سندات قبض/صرف، كشف حساب + واتساب |
| `/app/parties` | إدارة كاملة للعملاء والموردين (إضافة/تعديل/تفاصيل/أرشفة) |
| `/app/reports` | تقارير الفترات: الأرباح، حسب نوع القات، أداء الموظفين، دفتر الحركات |
| `/app/settings` | أنواع القات، حسابات الموظفين، حالة الاشتراك والباقات والدفعات |
| `/admin` | لوحة المشرف العام: المنشآت، الباقات، الاشتراكات، المالية، التجديدات |
| `/docs` | توثيق كامل لواجهات REST والمعمارية |

## الجداول

`platform_admins`, `subscription_plans`, `tenants`, `tenant_subscriptions`,
`subscription_payments`, `users`, `qat_types`, `suppliers`, `customers`,
`purchases`, `purchase_items`, `sales`, `sale_items`, `financial_transactions`, `sync_logs`.

كل الكيانات التشغيلية تحمل `tenant_id` مع فهارس عزل، وعمليات الفواتير تُنفذ داخل
`db.transaction` لضمان Rollback آمن (الفاتورة + الأصناف + رصيد الطرف + القيد المالي).

## حسابات التجربة

| الدور | الدخول |
| --- | --- |
| مالك منشأة | `777000111` / `123456` |
| موظف | `777000222` / `123456` |
| المشرف العام | `admin@qatsaas.com` / `admin123` (صفحة `/admin`) |

## الصلاحيات وقواعد العمل

- **owner**: كل الصلاحيات (إنشاء موظفين، إلغاء فواتير، أرشفة الحسابات).
- **manager**: إلغاء الفواتير والأرشفة وعرض الموظفين، بدون إنشاء حسابات.
- **worker**: تسجيل البيع والشراء والسندات فقط.
- **انتهاء الاشتراك**: يتحوّل `subscription_status` تلقائياً إلى `expired` عند انتهاء
  الفترة التجريبية؛ تبقى القراءة متاحة بينما تُرفض كل عمليات الكتابة بالرمز `402`
  حتى يفعّل المشرف العام باقة جديدة.
- **إلغاء فاتورة**: يُعكس أثرها على رصيد الطرف وتُحذف قيودها المالية داخل معاملة واحدة.
- **حذف حساب عليه رصيد**: مرفوض (`422`) — يجب تسوية الرصيد أولاً، والحذف أرشفة ناعمة.

## التشغيل

```bash
npm install
npm run build && npm start
```

**لا حاجة لخطوة هجرة يدوية**: عند أول طلب ينفّذ `src/lib/bootstrap.ts` تهيئة ذاتية
تحت قفل استشاري في PostgreSQL فتُنشئ المخطط كاملاً (`CREATE TABLE IF NOT EXISTS` من
`src/db/ddl.ts` المولّد عن `drizzle/0000_init_qat_saas.sql`) ثم تزرع البيانات الأولية.
العملية idempotent وتُعاد المحاولة تلقائياً عند أي فشل (لا تُخزَّن حالة الفشل).

للتطبيق اليدوي إن رغبت:

```bash
npx drizzle-kit push                                  # تطبيق المخطط مباشرة
npx drizzle-kit generate && npx drizzle-kit migrate   # أو عبر ملفات الهجرة
```

## استكشاف أخطاء الدخول

| العَرَض | الحل |
| --- | --- |
| «لا توجد حسابات بعد» | اضغط زر **تهيئة النظام** في صفحة الدخول أو `POST /api/v1/system/status` |
| «قاعدة البيانات قيد التهيئة» | أعد المحاولة بعد ثوانٍ — التهيئة تعمل في الخلفية |
| «رقم الجوال غير مسجل» | الرقم غير موجود؛ استخدم زر الدخول السريع أو سجّل منشأة جديدة |
| فحص الحالة | `GET /api/v1/system/status` يعرض `schemaReady / seeded / canLogin` وعدد السجلات |

صيغة رقم الجوال لا تهم: `777000111` و`0777000111` و`+967 777 000 111` و`٧٧٧٠٠٠١١١`
كلها تُوحَّد عبر `src/lib/phone.ts` قبل الحفظ أو المطابقة.

## المزامنة أوفلاين

1. التطبيق يسجّل العملية في جدول `outbox` المحلي مع `clientUuid`.
2. عند توفر الشبكة يرسل `POST /api/v1/sync/batch` دفعة واحدة.
3. الخادم يتحقق من `client_uuid` الفريد لكل مستأجر فيتجاهل المكرر (Idempotency).
4. `GET /api/v1/sync/pull?since=` يحدّث الكاش المحلي (أنواع القات، العملاء، الموردين، الفواتير).

لوحة الويب تطبّق نفس الفكرة عبر طابور في `localStorage` داخل شاشة نقطة البيع.
