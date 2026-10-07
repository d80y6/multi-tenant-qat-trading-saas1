"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, formatMoney } from "@/lib/client";

type QatType = { id: string; name: string; description: string | null; defaultPrice: string };
type User = { id: string; name: string; phone: string; role: string; isActive: boolean };
type Plan = { id: string; name: string; price: number; durationDays: number; maxUsers: number; features: string[] };
type Payment = { id: string; amount: string; paymentMethod: string; status: string; paidAt: string };
type Subscription = {
  tenant: { businessName?: string; subscriptionStatus?: string; status?: string };
  current: { planName: string; price: number; endDate: string; autoRenew: boolean } | null;
  expiresAt: string | null;
  daysLeft: number | null;
  usersUsed: number;
  maxUsers: number;
  plans: Plan[];
  payments: Payment[];
};

export default function SettingsPage() {
  const [types, setTypes] = useState<QatType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [typeForm, setTypeForm] = useState({ name: "", defaultPrice: "" });
  const [userForm, setUserForm] = useState({ name: "", phone: "", password: "", role: "worker" });
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const [t, u, s] = await Promise.all([
      apiGet<QatType[]>("/api/v1/qat-types"),
      apiGet<User[]>("/api/v1/users").catch(() => [] as User[]),
      apiGet<Subscription>("/api/v1/subscription").catch(() => null),
    ]);
    setTypes(t);
    setUsers(u);
    setSub(s);
  }

  async function editType(type: QatType) {
    const price = prompt(`سعر ${type.name} الافتراضي`, String(Math.round(Number(type.defaultPrice))));
    if (price === null) return;
    await apiPatch(`/api/v1/qat-types/${type.id}`, { defaultPrice: Number(price) });
    await reload();
  }

  async function archiveType(type: QatType) {
    if (!confirm(`أرشفة النوع ${type.name}؟`)) return;
    await fetch(`/api/v1/qat-types/${type.id}`, { method: "DELETE" });
    await reload();
  }

  useEffect(() => {
    reload().catch((e) => setMessage(e instanceof Error ? e.message : "خطأ"));
  }, []);

  async function addType() {
    try {
      await apiPost("/api/v1/qat-types", {
        name: typeForm.name,
        defaultPrice: Number(typeForm.defaultPrice || 0),
      });
      setTypeForm({ name: "", defaultPrice: "" });
      setMessage("تمت إضافة النوع");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  async function addUser() {
    try {
      await apiPost("/api/v1/users", userForm);
      setUserForm({ name: "", phone: "", password: "", role: "worker" });
      setMessage("تمت إضافة الموظف");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  async function toggleUser(user: User) {
    try {
      await apiPatch("/api/v1/users", { id: user.id, isActive: !user.isActive });
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card">
        <h2 className="text-sm font-black text-emerald-100">🌿 أنواع القات</h2>
        <div className="mt-3 flex gap-2">
          <input
            className="field"
            placeholder="اسم النوع (مثال: عرهبي)"
            value={typeForm.name}
            onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="field w-28"
            placeholder="السعر"
            inputMode="numeric"
            value={typeForm.defaultPrice}
            onChange={(e) => setTypeForm((f) => ({ ...f, defaultPrice: e.target.value }))}
          />
          <button onClick={addType} className="btn-primary shrink-0">
            إضافة
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2">
              <span className="text-sm text-emerald-100">{t.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-300">{formatMoney(t.defaultPrice)}</span>
                <button
                  onClick={() => editType(t)}
                  className="rounded-lg border border-emerald-500/25 px-2 py-0.5 text-[10px] text-emerald-200"
                >
                  سعر
                </button>
                <button
                  onClick={() => archiveType(t)}
                  className="rounded-lg border border-rose-500/30 px-2 py-0.5 text-[10px] text-rose-200"
                >
                  أرشفة
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-sm font-black text-emerald-100">👷 حسابات الموظفين</h2>
        <div className="mt-3 space-y-2">
          <input
            className="field"
            placeholder="الاسم"
            value={userForm.name}
            onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="رقم الجوال"
              inputMode="numeric"
              value={userForm.phone}
              onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className="field"
              placeholder="كلمة المرور"
              value={userForm.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            />
            <select
              className="field w-28"
              value={userForm.role}
              onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="worker">موظف</option>
              <option value="manager">مدير</option>
            </select>
          </div>
          <button onClick={addUser} className="btn-primary w-full">
            إضافة حساب
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2">
              <div>
                <p className="text-sm text-emerald-100">{u.name}</p>
                <p className="text-[11px] text-emerald-200/50">
                  {u.phone} · {u.role === "owner" ? "مالك" : u.role === "manager" ? "مدير" : "موظف"}
                </p>
              </div>
              {u.role !== "owner" && (
                <button onClick={() => toggleUser(u)} className={u.isActive ? "btn-danger px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"}>
                  {u.isActive ? "تعطيل" : "تفعيل"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {sub && (
        <section className="card lg:col-span-2">
          <h2 className="text-sm font-black text-emerald-100">💳 الاشتراك والفوترة</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-emerald-900/30 p-3">
              <p className="text-[11px] text-emerald-200/60">الباقة الحالية</p>
              <p className="mt-1 text-sm font-black text-emerald-200">
                {sub.current?.planName ?? "فترة تجريبية"}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-900/30 p-3">
              <p className="text-[11px] text-emerald-200/60">الحالة</p>
              <p className="mt-1 text-sm font-black text-emerald-200">
                {sub.tenant.subscriptionStatus === "active"
                  ? "فعال"
                  : sub.tenant.subscriptionStatus === "trial"
                    ? "تجريبي"
                    : "منتهي"}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-900/30 p-3">
              <p className="text-[11px] text-emerald-200/60">المتبقي</p>
              <p className={`mt-1 text-sm font-black ${(sub.daysLeft ?? 0) > 3 ? "text-emerald-200" : "text-rose-300"}`}>
                {sub.daysLeft !== null ? `${sub.daysLeft} يوم` : "-"}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-900/30 p-3">
              <p className="text-[11px] text-emerald-200/60">المستخدمون</p>
              <p className="mt-1 text-sm font-black text-emerald-200">
                {sub.usersUsed} / {sub.maxUsers}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {sub.plans.map((p) => (
              <div key={p.id} className="rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-emerald-100">{p.name}</p>
                  <p className="text-sm font-black text-emerald-300">{formatMoney(p.price)}</p>
                </div>
                <p className="text-[11px] text-emerald-200/50">
                  {p.durationDays} يوم · حتى {p.maxUsers} مستخدم
                </p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-emerald-200/60">
                  {p.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {sub.payments.length > 0 && (
            <ul className="mt-3 space-y-1 text-[11px] text-emerald-200/60">
              {sub.payments.map((p) => (
                <li key={p.id} className="flex justify-between rounded-lg bg-emerald-900/20 px-3 py-1.5">
                  <span>
                    دفعة {p.paymentMethod} · {new Date(p.paidAt).toLocaleDateString("ar-YE")}
                  </span>
                  <span className="font-bold text-emerald-300">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-emerald-200/50">
            للتجديد تواصل مع إدارة المنصة — يتم التفعيل فوراً من لوحة المشرف العام.
          </p>
        </section>
      )}

      {message && <p className="card text-xs text-emerald-200 lg:col-span-2">{message}</p>}
    </div>
  );
}
