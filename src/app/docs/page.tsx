import Link from "next/link";

export const dynamic = "force-static";

const endpoints: { method: string; path: string; desc: string; auth: string }[] = [
  { method: "GET/POST", path: "/api/v1/system/status", desc: "تشخيص النظام وإعادة التهيئة (إنشاء المخطط + البيانات التجريبية)", auth: "عام" },
  { method: "POST", path: "/api/v1/auth/register", desc: "تسجيل منشأة جديدة + مالك + تجربة 14 يوم", auth: "عام" },
  { method: "POST", path: "/api/v1/auth/login", desc: "دخول التاجر/الموظف (JWT يحوي tenant_id, user_id, role)", auth: "عام" },
  { method: "POST", path: "/api/v1/auth/admin-login", desc: "دخول المشرف العام", auth: "عام" },
  { method: "GET", path: "/api/v1/auth/me", desc: "بيانات الجلسة والمنشأة", auth: "Tenant" },
  { method: "GET/POST", path: "/api/v1/qat-types", desc: "أنواع القات", auth: "Tenant" },
  { method: "GET/POST", path: "/api/v1/customers", desc: "العملاء + بحث + فلترة المدينين", auth: "Tenant" },
  { method: "GET/POST", path: "/api/v1/suppliers", desc: "الموردين + أرصدتهم", auth: "Tenant" },
  { method: "GET/PATCH/DELETE", path: "/api/v1/customers/{id}", desc: "تفاصيل العميل وإحصاءاته، تعديل، أرشفة", auth: "Tenant" },
  { method: "GET/PATCH/DELETE", path: "/api/v1/suppliers/{id}", desc: "تفاصيل المورد، تعديل، أرشفة", auth: "Tenant" },
  { method: "PATCH/DELETE", path: "/api/v1/qat-types/{id}", desc: "تعديل سعر النوع أو أرشفته", auth: "Tenant" },
  { method: "GET/POST", path: "/api/v1/sales", desc: "فواتير البيع (نقدي/آجل/جزئي) داخل معاملة ACID", auth: "Tenant" },
  { method: "GET/DELETE", path: "/api/v1/sales/{id}", desc: "تفاصيل الفاتورة للطباعة، أو إلغاؤها مع عكس القيود", auth: "Tenant" },
  { method: "GET/POST", path: "/api/v1/purchases", desc: "فواتير الشراء متعددة الموردين", auth: "Tenant" },
  { method: "GET/DELETE", path: "/api/v1/purchases/{id}", desc: "تفاصيل/إلغاء فاتورة شراء", auth: "Tenant" },
  { method: "POST", path: "/api/v1/vouchers/collections", desc: "سند قبض من عميل (يخصم من الدين)", auth: "Tenant" },
  { method: "POST", path: "/api/v1/vouchers/payments", desc: "سند صرف لمورد", auth: "Tenant" },
  { method: "GET", path: "/api/v1/statements?partyType&partyId", desc: "كشف حساب بالحركة والرصيد التراكمي", auth: "Tenant" },
  { method: "GET", path: "/api/v1/reports/dashboard", desc: "مؤشرات اليوم والذمم وأعلى المديونيات", auth: "Tenant" },
  { method: "GET", path: "/api/v1/reports/summary?from&to", desc: "تقرير فترة: أرباح، حسب النوع، حسب الموظف، يومي", auth: "Tenant" },
  { method: "GET", path: "/api/v1/transactions", desc: "دفتر الأستاذ العام مع فلترة بالنوع والفترة", auth: "Tenant" },
  { method: "GET", path: "/api/v1/subscription", desc: "حالة اشتراك المنشأة والباقات وسجل الدفعات", auth: "Tenant" },
  { method: "GET/POST/PATCH", path: "/api/v1/users", desc: "حسابات الموظفين وصلاحياتهم", auth: "Owner" },
  { method: "POST", path: "/api/v1/sync/batch", desc: "مزامنة دفعية للعمليات المسجلة أوفلاين (idempotent عبر clientUuid)", auth: "Tenant" },
  { method: "GET", path: "/api/v1/sync/pull", desc: "سحب التغييرات منذ تاريخ محدد للتخزين المحلي", auth: "Tenant" },
  { method: "GET/POST/PATCH", path: "/api/v1/admin/tenants", desc: "إدارة المنشآت وتفعيل/إيقاف الحسابات", auth: "Platform" },
  { method: "GET/POST/PATCH", path: "/api/v1/admin/plans", desc: "باقات الاشتراك", auth: "Platform" },
  { method: "GET/POST", path: "/api/v1/admin/subscriptions", desc: "تفعيل وتجديد الاشتراكات + تسجيل الدفعات", auth: "Platform" },
  { method: "GET", path: "/api/v1/admin/stats", desc: "المؤشرات المالية للمنصة والتجديدات القادمة", auth: "Platform" },
];

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-emerald-50">توثيق المنصة</h1>
        <Link href="/" className="btn-ghost px-3 py-1.5 text-xs">
          رجوع
        </Link>
      </div>

      <section className="card">
        <h2 className="mb-2 text-sm font-black text-emerald-100">المعمارية</h2>
        <ul className="space-y-1 text-xs leading-6 text-emerald-200/70">
          <li>• قاعدة بيانات واحدة متعددة المستأجرين مع عزل كامل عبر <code>tenant_id</code> في كل كيان.</li>
          <li>• مصادقة JWT (HS256) تحمل <code>tenant_id</code> و <code>user_id</code> و <code>role</code>، وكلمات المرور بـ bcrypt.</li>
          <li>• حارس <code>requireTenant()</code> يفرض نطاق المنشأة على كل استعلام (Query Scoping) ويتحقق من حالة الاشتراك.</li>
          <li>• كل فاتورة تُكتب داخل معاملة واحدة: الفاتورة + الأصناف + رصيد الطرف + القيد المالي (Rollback آمن).</li>
          <li>• المزامنة أوفلاين: مفتاح <code>client_uuid</code> فريد لكل عملية يمنع التكرار عند إعادة الإرسال.</li>
          <li>• تهيئة ذاتية: عند أول طلب يتحقق النظام من وجود المخطط وينشئه إن لزم (تحت قفل استشاري) ثم يزرع البيانات.</li>
          <li>• توحيد أرقام الجوال: يقبل <code>+967</code> و<code>00967</code> و<code>0</code> والأرقام العربية ويخزّنها بصيغة موحدة.</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-black text-emerald-100">بيانات الدخول التجريبية</h2>
        <ul className="space-y-1 text-xs leading-6 text-emerald-200/70">
          <li>• مالك منشأة: <code dir="ltr">777000111</code> / <code dir="ltr">123456</code></li>
          <li>• موظف: <code dir="ltr">777000222</code> / <code dir="ltr">123456</code></li>
          <li>• المشرف العام (صفحة /admin): <code dir="ltr">admin@qatsaas.com</code> / <code dir="ltr">admin123</code></li>
          <li>
            • تعذّر الدخول؟ افتح <code dir="ltr">/api/v1/system/status</code> لمعرفة حالة القاعدة، أو
            اضغط زر «تهيئة النظام» في صفحة الدخول.
          </li>
        </ul>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-black text-emerald-100">واجهات REST (الإصدار v1)</h2>
        <table className="w-full text-right text-xs">
          <thead className="text-emerald-200/50">
            <tr>
              <th className="py-2">الطريقة</th>
              <th>المسار</th>
              <th>الوصف</th>
              <th>الصلاحية</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => (
              <tr key={e.path} className="border-t border-emerald-500/10">
                <td className="py-2 font-bold text-emerald-300">{e.method}</td>
                <td dir="ltr" className="text-left font-mono text-[11px] text-emerald-100">{e.path}</td>
                <td className="text-emerald-200/70">{e.desc}</td>
                <td className="text-emerald-200/50">{e.auth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-black text-emerald-100">تطبيق Flutter (مجلد mobile/)</h2>
        <ul className="space-y-1 text-xs leading-6 text-emerald-200/70">
          <li>• <code>lib/core/api_client.dart</code> — عميل REST مع حقن التوكن تلقائياً.</li>
          <li>• <code>lib/core/local_store.dart</code> — تخزين محلي SQLite (طابور عمليات + كاش الأطراف والأنواع).</li>
          <li>• <code>lib/core/sync_service.dart</code> — مزامنة خلفية تستدعي <code>/sync/batch</code> و <code>/sync/pull</code> عند عودة الشبكة.</li>
          <li>• <code>lib/features/pos_screen.dart</code> — شاشة بيع سريعة بلوحة أرقام وشرائح أنواع القات.</li>
          <li>• طباعة بلوتوث عبر <code>esc_pos_bluetooth</code> لإصدار إيصال الفاتورة.</li>
        </ul>
      </section>
    </main>
  );
}
