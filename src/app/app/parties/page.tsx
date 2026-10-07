"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, formatDate, formatMoney } from "@/lib/client";

type Party = {
  id: string;
  name: string;
  phone: string | null;
  address?: string | null;
  notes: string | null;
  balance: string;
  isActive: boolean;
};

type PartyDetail = Party & {
  stats: { invoices: number; total: number; lastSale?: string | null; lastPurchase?: string | null };
};

export default function PartiesPage() {
  const [tab, setTab] = useState<"customer" | "supplier">("customer");
  const [rows, setRows] = useState<Party[]>([]);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<PartyDetail | null>(null);
  const [editing, setEditing] = useState<Party | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "", openingBalance: "" });

  const base = tab === "customer" ? "/api/v1/customers" : "/api/v1/suppliers";

  const load = useCallback(async () => {
    setRows(await apiGet<Party[]>(`${base}?q=${encodeURIComponent(q)}`));
  }, [base, q]);

  useEffect(() => {
    load().catch((e) => setMessage(e instanceof Error ? e.message : "خطأ"));
  }, [load]);

  async function create() {
    try {
      await apiPost(base, {
        name: form.name,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        openingBalance: Number(form.openingBalance || 0),
      });
      setForm({ name: "", phone: "", address: "", notes: "", openingBalance: "" });
      setMessage("تمت الإضافة بنجاح");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await apiPatch(`${base}/${editing.id}`, {
        name: editing.name,
        phone: editing.phone,
        notes: editing.notes,
        ...(tab === "supplier" ? { address: editing.address ?? null } : {}),
      });
      setEditing(null);
      setMessage("تم التحديث");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  async function archive(party: Party) {
    if (!confirm(`أرشفة ${party.name}؟`)) return;
    try {
      const res = await fetch(`${base}/${party.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!body.success) throw new Error(body.message);
      setMessage("تمت الأرشفة");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-950/60 p-1">
        {(["customer", "supplier"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-black ${tab === t ? "bg-emerald-500 text-emerald-950" : "text-emerald-200"}`}
          >
            {t === "customer" ? "👥 العملاء" : "🚚 الموردون"}
          </button>
        ))}
      </div>

      <section className="card">
        <h2 className="mb-2 text-sm font-black text-emerald-100">
          إضافة {tab === "customer" ? "عميل" : "مورد"}
        </h2>
        <div className="grid gap-2 md:grid-cols-5">
          <input
            className="field"
            placeholder="الاسم"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="field"
            placeholder="الجوال"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <input
            className="field"
            placeholder={tab === "customer" ? "ملاحظات" : "العنوان"}
            value={tab === "customer" ? form.notes : form.address}
            onChange={(e) =>
              setForm((f) =>
                tab === "customer" ? { ...f, notes: e.target.value } : { ...f, address: e.target.value },
              )
            }
          />
          <input
            className="field"
            placeholder="رصيد افتتاحي"
            inputMode="numeric"
            value={form.openingBalance}
            onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
          />
          <button onClick={create} className="btn-primary">
            + إضافة
          </button>
        </div>
      </section>

      <section className="card">
        <input
          className="field mb-3"
          placeholder="بحث بالاسم أو الجوال..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-emerald-200/50">
              <tr>
                <th className="py-2">الاسم</th>
                <th>الجوال</th>
                <th>الرصيد</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-emerald-500/10">
                  <td className="py-2 font-bold text-emerald-100">{p.name}</td>
                  <td className="text-emerald-200/60">{p.phone ?? "-"}</td>
                  <td
                    className={`font-black ${Number(p.balance) > 0 ? (tab === "customer" ? "text-amber-300" : "text-rose-300") : "text-emerald-300"}`}
                  >
                    {formatMoney(p.balance)}
                  </td>
                  <td className="text-emerald-200/60">{p.isActive ? "نشط" : "مؤرشف"}</td>
                  <td className="whitespace-nowrap">
                    <button
                      onClick={async () =>
                        setDetail(await apiGet<PartyDetail>(`${base}/${p.id}`))
                      }
                      className="rounded-lg border border-emerald-500/25 px-2 py-1 text-[11px] text-emerald-200"
                    >
                      تفاصيل
                    </button>{" "}
                    <button
                      onClick={() => setEditing(p)}
                      className="rounded-lg border border-emerald-500/25 px-2 py-1 text-[11px] text-emerald-200"
                    >
                      تعديل
                    </button>{" "}
                    <button
                      onClick={() => archive(p)}
                      className="rounded-lg border border-rose-500/30 px-2 py-1 text-[11px] text-rose-200"
                    >
                      أرشفة
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-emerald-200/50">
                    لا توجد نتائج
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {message && <p className="card text-xs text-emerald-200">{message}</p>}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm space-y-2">
            <h3 className="text-sm font-black text-emerald-100">تعديل {editing.name}</h3>
            <input
              className="field"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <input
              className="field"
              value={editing.phone ?? ""}
              placeholder="الجوال"
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
            {tab === "supplier" && (
              <input
                className="field"
                value={editing.address ?? ""}
                placeholder="العنوان"
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            )}
            <input
              className="field"
              value={editing.notes ?? ""}
              placeholder="ملاحظات"
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost flex-1">
                إلغاء
              </button>
              <button onClick={saveEdit} className="btn-primary flex-1">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-emerald-100">{detail.name}</h3>
              <button onClick={() => setDetail(null)} className="text-xs text-rose-300">
                إغلاق ✕
              </button>
            </div>
            <p className="text-xs text-emerald-200/70">الجوال: {detail.phone ?? "-"}</p>
            <p className="text-xs text-emerald-200/70">
              الرصيد الحالي: <b className="text-amber-300">{formatMoney(detail.balance)}</b>
            </p>
            <p className="text-xs text-emerald-200/70">عدد الفواتير: {detail.stats.invoices}</p>
            <p className="text-xs text-emerald-200/70">
              إجمالي التعامل: {formatMoney(detail.stats.total)}
            </p>
            <p className="text-xs text-emerald-200/70">
              آخر عملية: {formatDate(detail.stats.lastSale ?? detail.stats.lastPurchase ?? null)}
            </p>
            {detail.notes && <p className="text-xs text-emerald-200/50">{detail.notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
