"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@qatsaas.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/v1/auth/admin-login", { email, password });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto w-full max-w-sm space-y-3">
      <h1 className="text-lg font-black text-emerald-50">🛡️ لوحة المشرف العام</h1>
      <div>
        <label className="label">البريد الإلكتروني</label>
        <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">كلمة المرور</label>
        <input
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="rounded-lg bg-rose-500/15 p-2 text-xs text-rose-200">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "جارٍ..." : "دخول"}
      </button>
      <p className="text-center text-[11px] text-emerald-200/50">admin@qatsaas.com / admin123</p>
    </form>
  );
}
