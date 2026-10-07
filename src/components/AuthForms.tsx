"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client";

type Mode = "login" | "register";

type SystemStatus = {
  schemaReady: boolean;
  seeded: boolean;
  canLogin: boolean;
  counts: { admins: number; tenants: number; users: number };
};

export default function AuthForms() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [form, setForm] = useState({
    phone: "777000111",
    password: "123456",
    businessName: "",
    ownerName: "",
    city: "",
  });

  useEffect(() => {
    apiGet<SystemStatus>("/api/v1/system/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function doLogin(phone: string, password: string) {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await apiPost("/api/v1/auth/login", { phone, password });
      const next = params.get("next") ?? "/app";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "login") return doLogin(form.phone, form.password);

    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/v1/auth/register", {
        businessName: form.businessName,
        ownerName: form.ownerName,
        phone: form.phone,
        city: form.city,
        password: form.password,
      });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  }

  async function repair() {
    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/v1/system/status", {});
      const fresh = await apiGet<SystemStatus>("/api/v1/system/status");
      setStatus(fresh);
      setInfo("تمت تهيئة النظام — جرّب الدخول الآن بالحساب التجريبي");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذرت التهيئة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card w-full max-w-md">
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-emerald-950/60 p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-lg py-2 text-sm font-bold ${mode === "login" ? "bg-emerald-500 text-emerald-950" : "text-emerald-200"}`}
        >
          دخول التاجر
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-lg py-2 text-sm font-bold ${mode === "register" ? "bg-emerald-500 text-emerald-950" : "text-emerald-200"}`}
        >
          تسجيل منشأة
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <>
            <div>
              <label className="label">اسم المنشأة</label>
              <input className="field" value={form.businessName} onChange={set("businessName")} required />
            </div>
            <div>
              <label className="label">اسم المالك</label>
              <input className="field" value={form.ownerName} onChange={set("ownerName")} required />
            </div>
            <div>
              <label className="label">المدينة</label>
              <input className="field" value={form.city} onChange={set("city")} />
            </div>
          </>
        )}
        <div>
          <label className="label">رقم الجوال</label>
          <input
            className="field"
            value={form.phone}
            onChange={set("phone")}
            inputMode="tel"
            dir="ltr"
            autoComplete="username"
            required
          />
          <p className="mt-1 text-[10px] text-emerald-200/40">
            يمكن إدخاله بأي صيغة: 777000111 أو 0777000111 أو +967777000111
          </p>
        </div>
        <div>
          <label className="label">كلمة المرور</label>
          <input
            className="field"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/15 p-2 text-xs text-rose-200">
            <p>{error}</p>
            {status && !status.canLogin && (
              <button type="button" onClick={repair} className="mt-2 underline">
                تهيئة النظام وإنشاء البيانات التجريبية
              </button>
            )}
          </div>
        )}
        {info && <p className="rounded-lg bg-emerald-500/15 p-2 text-xs text-emerald-200">{info}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "جارٍ..." : mode === "login" ? "دخول" : "إنشاء حساب + تجربة 14 يوم"}
        </button>
      </form>

      {mode === "login" && (
        <div className="mt-4 border-t border-emerald-500/15 pt-3">
          <p className="mb-2 text-center text-[11px] font-bold text-emerald-200/60">
            دخول سريع بحساب تجريبي
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => doLogin("777000111", "123456")}
              className="btn-ghost text-xs"
            >
              👑 مالك منشأة
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => doLogin("777000222", "123456")}
              className="btn-ghost text-xs"
            >
              👷 موظف
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-emerald-200/40">
            المشرف العام: admin@qatsaas.com / admin123 — عبر صفحة /admin
          </p>
          {status && !status.canLogin && (
            <button type="button" onClick={repair} className="btn-ghost mt-2 w-full text-xs">
              ⚙️ تهيئة قاعدة البيانات وإنشاء الحسابات التجريبية
            </button>
          )}
        </div>
      )}
    </div>
  );
}
