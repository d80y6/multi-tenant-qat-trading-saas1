"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, formatDate, formatMoney } from "@/lib/client";

type Tenant = {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  city: string | null;
  status: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  usersCount: number;
  customersCount: number;
  salesTotal: string;
};

type Plan = {
  id: string;
  name: string;
  price: string;
  durationDays: number;
  maxUsers: number;
  features: string[];
  isActive: boolean;
};

type Subscription = {
  id: string;
  tenantName: string;
  planName: string;
  price: string;
  startDate: string;
  endDate: string;
  status: string;
};

type PaymentRow = {
  id: string;
  tenantName: string;
  planName: string | null;
  amount: number;
  paymentMethod: string;
  provider: string;
  transactionReference: string | null;
  checkoutUrl: string | null;
  status: string;
  createdAt: string;
};

type Stats = {
  revenueTotal: number;
  revenueMonth: number;
  paymentsCount: number;
  tenantsTotal: number;
  tenantsActive: number;
  tenantsTrial: number;
  tenantsExpired: number;
  usersTotal: number;
  platformGmv: number;
  expiringSoon: { id: string; tenantName: string; planName: string; endDate: string; daysLeft: number }[];
  recentPayments: {
    id: string;
    tenantName: string;
    amount: number;
    paymentMethod: string;
    status: string;
    paidAt: string;
  }[];
};

export default function AdminConsole({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PaymentRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [newTenant, setNewTenant] = useState({ businessName: "", ownerName: "", phone: "", city: "" });
  const [newPlan, setNewPlan] = useState({ name: "", price: "", durationDays: "30", maxUsers: "3" });

  async function reload() {
    const [t, p, s, st, pay] = await Promise.all([
      apiGet<Tenant[]>("/api/v1/admin/tenants"),
      apiGet<Plan[]>("/api/v1/admin/plans"),
      apiGet<Subscription[]>("/api/v1/admin/subscriptions"),
      apiGet<Stats>("/api/v1/admin/stats"),
      apiGet<PaymentRow[]>("/api/v1/admin/payments?status=pending").catch(() => []),
    ]);
    setTenants(t);
    setPlans(p);
    setSubs(s);
    setStats(st);
    setPendingPayments(pay);
  }

  /** تأكيد/رفض دفعة يدوية — التأكيد يفعّل الاشتراك فوراً */
  async function decidePayment(paymentId: string, action: "confirm" | "reject") {
    try {
      await apiPost("/api/v1/admin/payments", { paymentId, action });
      setMessage(action === "confirm" ? "تم تأكيد الدفع وتفعيل الاشتراك" : "تم رفض الدفعة");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  useEffect(() => {
    reload().catch((e) => setMessage(e instanceof Error ? e.message : "خطأ"));
  }, []);

  const mrr = subs
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + Number(s.price), 0);

  async function toggleTenant(tenant: Tenant) {
    await apiPatch("/api/v1/admin/tenants", {
      id: tenant.id,
      status: tenant.status === "active" ? "suspended" : "active",
    });
    await reload();
  }

  async function activate(tenant: Tenant, planId: string) {
    if (!planId) return;
    await apiPost("/api/v1/admin/subscriptions", { tenantId: tenant.id, planId, autoRenew: true });
    setMessage(`تم تفعيل الاشتراك لـ ${tenant.businessName}`);
    await reload();
  }

  async function createTenant() {
    try {
      await apiPost("/api/v1/admin/tenants", { ...newTenant, password: "123456", trialDays: 14 });
      setNewTenant({ businessName: "", ownerName: "", phone: "", city: "" });
      setMessage("تم إنشاء المنشأة بكلمة مرور افتراضية 123456");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  async function createPlan() {
    try {
      await apiPost("/api/v1/admin/plans", {
        name: newPlan.name,
        price: Number(newPlan.price),
        durationDays: Number(newPlan.durationDays),
        maxUsers: Number(newPlan.maxUsers),
        features: [],
      });
      setNewPlan({ name: "", price: "", durationDays: "30", maxUsers: "3" });
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-emerald-50">🛡️ لوحة المشرف العام</h1>
          <p className="text-[11px] text-emerald-200/60">{adminName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={async () => {
              try {
                const res = await apiPost<{ result: { expired: number; renewed: number; trialsClosed: number } }>(
                  "/api/v1/admin/maintenance",
                  {},
                );
                setMessage(
                  `تمت الصيانة: ${res.result.renewed} تجديد تلقائي، ${res.result.expired} انتهى، ${res.result.trialsClosed} تجربة مغلقة`,
                );
                await reload();
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "خطأ");
              }
            }}
          >
            ⚙️ تشغيل دورة الاشتراكات
          </button>
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={async () => {
              await apiPost("/api/v1/auth/logout", {});
              router.push("/");
              router.refresh();
            }}
          >
            خروج
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["عدد المنشآت", String(stats?.tenantsTotal ?? tenants.length), `نشطة ${stats?.tenantsActive ?? 0}`],
          ["تجريبي / منتهي", `${stats?.tenantsTrial ?? 0} / ${stats?.tenantsExpired ?? 0}`, `مستخدمون ${stats?.usersTotal ?? 0}`],
          ["إيراد المنصة", formatMoney(stats?.revenueTotal ?? 0), `هذا الشهر ${formatMoney(stats?.revenueMonth ?? 0)}`],
          ["الإيراد الدوري (MRR)", formatMoney(mrr), `حجم تداول العملاء ${formatMoney(stats?.platformGmv ?? 0)}`],
        ].map(([label, value, hint]) => (
          <div key={label} className="card">
            <p className="text-[11px] text-emerald-200/60">{label}</p>
            <p className="mt-1 text-xl font-black text-emerald-300">{value}</p>
            <p className="mt-1 text-[10px] text-emerald-200/50">{hint}</p>
          </div>
        ))}
      </div>

      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-3 text-sm font-black text-emerald-100">اشتراكات تقترب من الانتهاء</h2>
            <ul className="space-y-2">
              {stats.expiringSoon.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-bold text-emerald-100">{e.tenantName}</p>
                    <p className="text-[11px] text-emerald-200/50">
                      {e.planName} · ينتهي {formatDate(e.endDate)}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-black ${e.daysLeft <= 5 ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}
                  >
                    {e.daysLeft} يوم
                  </span>
                </li>
              ))}
              {stats.expiringSoon.length === 0 && (
                <li className="text-xs text-emerald-200/50">لا توجد اشتراكات فعالة</li>
              )}
            </ul>
          </section>

        <section className="card lg:col-span-2">
          <h2 className="mb-3 text-sm font-black text-emerald-100">
            💳 دفعات بانتظار التأكيد ({pendingPayments.length})
          </h2>
          <ul className="space-y-2">
            {pendingPayments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-bold text-emerald-100">
                    {p.tenantName} — {p.planName ?? "اشتراك"}
                  </p>
                  <p className="text-[11px] text-emerald-200/50">
                    {p.provider === "stripe" ? "بطاقة" : "تحويل بنكي"} · مرجع{" "}
                    {p.transactionReference ?? "-"} · {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-emerald-300">
                    {formatMoney(p.amount)}
                  </span>
                  <button
                    onClick={() => decidePayment(p.id, "confirm")}
                    className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-emerald-950"
                  >
                    تأكيد
                  </button>
                  <button
                    onClick={() => decidePayment(p.id, "reject")}
                    className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs font-bold text-rose-200"
                  >
                    رفض
                  </button>
                </div>
              </li>
            ))}
            {pendingPayments.length === 0 && (
              <li className="text-xs text-emerald-200/50">لا توجد دفعات معلّقة</li>
            )}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-black text-emerald-100">آخر دفعات الاشتراكات</h2>
            <ul className="space-y-2">
              {stats.recentPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-bold text-emerald-100">{p.tenantName}</p>
                    <p className="text-[11px] text-emerald-200/50">
                      {p.paymentMethod} · {formatDate(p.paidAt)}
                    </p>
                  </div>
                  <span className="text-sm font-black text-emerald-300">{formatMoney(p.amount)}</span>
                </li>
              ))}
              {stats.recentPayments.length === 0 && (
                <li className="text-xs text-emerald-200/50">لا توجد دفعات</li>
              )}
            </ul>
          </section>
        </div>
      )}

      <section className="card">
        <h2 className="mb-3 text-sm font-black text-emerald-100">المنشآت (Tenants)</h2>
        <div className="mb-3 grid gap-2 md:grid-cols-5">
          <input
            className="field"
            placeholder="اسم المنشأة"
            value={newTenant.businessName}
            onChange={(e) => setNewTenant((f) => ({ ...f, businessName: e.target.value }))}
          />
          <input
            className="field"
            placeholder="اسم المالك"
            value={newTenant.ownerName}
            onChange={(e) => setNewTenant((f) => ({ ...f, ownerName: e.target.value }))}
          />
          <input
            className="field"
            placeholder="الجوال"
            value={newTenant.phone}
            onChange={(e) => setNewTenant((f) => ({ ...f, phone: e.target.value }))}
          />
          <input
            className="field"
            placeholder="المدينة"
            value={newTenant.city}
            onChange={(e) => setNewTenant((f) => ({ ...f, city: e.target.value }))}
          />
          <button onClick={createTenant} className="btn-primary">
            + إنشاء منشأة
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-emerald-200/50">
              <tr>
                <th className="py-2">المنشأة</th>
                <th>المالك</th>
                <th>المستخدمون</th>
                <th>المبيعات</th>
                <th>الاشتراك</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-t border-emerald-500/10">
                  <td className="py-2 font-bold text-emerald-100">{t.businessName}</td>
                  <td className="text-emerald-200/70">
                    {t.ownerName}
                    <br />
                    <span className="text-[10px]">{t.phone}</span>
                  </td>
                  <td className="text-emerald-200/70">{t.usersCount}</td>
                  <td className="font-bold text-emerald-300">{formatMoney(t.salesTotal)}</td>
                  <td>
                    <span className="rounded-md bg-emerald-900/60 px-2 py-0.5 text-[10px] text-emerald-200">
                      {t.subscriptionStatus === "active"
                        ? "فعال"
                        : t.subscriptionStatus === "trial"
                          ? "تجريبي"
                          : "منتهي"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] ${t.status === "active" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}
                    >
                      {t.status === "active" ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td className="space-x-1 space-x-reverse whitespace-nowrap">
                    <select
                      className="rounded-lg border border-emerald-500/25 bg-emerald-950 px-2 py-1 text-[11px]"
                      defaultValue=""
                      onChange={(e) => activate(t, e.target.value)}
                    >
                      <option value="">تفعيل باقة...</option>
                      {plans
                        .filter((p) => p.isActive)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatMoney(p.price)})
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => toggleTenant(t)}
                      className="rounded-lg border border-emerald-500/25 px-2 py-1 text-[11px] text-emerald-200"
                    >
                      {t.status === "active" ? "إيقاف" : "تنشيط"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-black text-emerald-100">باقات الاشتراك</h2>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input
              className="field"
              placeholder="اسم الباقة"
              value={newPlan.name}
              onChange={(e) => setNewPlan((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="field"
              placeholder="السعر"
              value={newPlan.price}
              onChange={(e) => setNewPlan((f) => ({ ...f, price: e.target.value }))}
            />
            <input
              className="field"
              placeholder="المدة (أيام)"
              value={newPlan.durationDays}
              onChange={(e) => setNewPlan((f) => ({ ...f, durationDays: e.target.value }))}
            />
            <input
              className="field"
              placeholder="أقصى مستخدمين"
              value={newPlan.maxUsers}
              onChange={(e) => setNewPlan((f) => ({ ...f, maxUsers: e.target.value }))}
            />
            <button onClick={createPlan} className="btn-primary col-span-2">
              + إضافة باقة
            </button>
          </div>
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-emerald-100">{p.name}</p>
                  <p className="text-[11px] text-emerald-200/50">
                    {p.durationDays} يوم · {p.maxUsers} مستخدم
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-emerald-300">{formatMoney(p.price)}</span>
                  <button
                    onClick={async () => {
                      await apiPatch("/api/v1/admin/plans", { id: p.id, isActive: !p.isActive });
                      await reload();
                    }}
                    className="rounded-lg border border-emerald-500/25 px-2 py-1 text-[10px] text-emerald-200"
                  >
                    {p.isActive ? "إيقاف" : "تفعيل"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-black text-emerald-100">سجل الاشتراكات</h2>
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="rounded-xl bg-emerald-900/30 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-emerald-100">{s.tenantName}</p>
                  <span className="text-xs font-black text-emerald-300">{formatMoney(s.price)}</span>
                </div>
                <p className="text-[11px] text-emerald-200/50">
                  {s.planName} · ينتهي {formatDate(s.endDate)} ·{" "}
                  {s.status === "active" ? "فعال" : "منتهي"}
                </p>
              </li>
            ))}
            {subs.length === 0 && <li className="text-xs text-emerald-200/50">لا توجد اشتراكات</li>}
          </ul>
        </section>
      </div>

      {message && <p className="card text-xs text-emerald-200">{message}</p>}
    </div>
  );
}
