"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, formatDate, formatMoney } from "@/lib/client";

type Report = {
  range: { from: string; to: string };
  sales: { total: number; paid: number; credit: number; count: number };
  purchases: { total: number; paid: number; credit: number; count: number };
  collections: number;
  payments: number;
  grossProfit: number;
  netCash: number;
  byType: { name: string; quantity: number; total: number }[];
  byUser: { name: string; total: number; count: number }[];
  daily: { day: string; total: number; count: number }[];
};

type Txn = {
  id: string;
  transactionType: string;
  amount: string;
  transactionDate: string;
  notes: string | null;
  userName: string | null;
  customerName: string | null;
  supplierName: string | null;
};

const typeLabel: Record<string, string> = {
  sale: "فاتورة بيع",
  sale_payment: "دفعة مع فاتورة بيع",
  purchase: "فاتورة شراء",
  purchase_payment: "دفعة مع فاتورة شراء",
  collection: "سند قبض",
  payment: "سند صرف",
  adjustment: "تسوية",
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, t] = await Promise.all([
      apiGet<Report>(`/api/v1/reports/summary?from=${from}&to=${to}`),
      apiGet<Txn[]>(
        `/api/v1/transactions?from=${from}&to=${to}${filter ? `&type=${filter}` : ""}&limit=150`,
      ),
    ]);
    setReport(r);
    setTxns(t);
  }, [from, to, filter]);

  useEffect(() => {
    load().catch((e) => setMessage(e instanceof Error ? e.message : "خطأ"));
  }, [load]);

  const maxDaily = Math.max(1, ...(report?.daily.map((d) => d.total) ?? [1]));

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <label className="label">من تاريخ</label>
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">إلى تاريخ</label>
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label">نوع الحركة</label>
            <select className="field" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">الكل</option>
              <option value="sale">فواتير بيع</option>
              <option value="purchase">فواتير شراء</option>
              <option value="collection">سندات قبض</option>
              <option value="payment">سندات صرف</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => load()} className="btn-primary flex-1">
              تحديث
            </button>
            <button onClick={() => window.print()} className="btn-ghost">
              🖨️
            </button>
          </div>
        </div>
      </section>

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["إجمالي المبيعات", formatMoney(report.sales.total), `${report.sales.count} فاتورة`, "text-emerald-300"],
              ["إجمالي المشتريات", formatMoney(report.purchases.total), `${report.purchases.count} فاتورة`, "text-sky-300"],
              ["هامش الربح التقديري", formatMoney(report.grossProfit), "مبيعات − مشتريات", "text-amber-300"],
              ["صافي النقد", formatMoney(report.netCash), "محصل − مدفوع", "text-emerald-200"],
            ].map(([label, value, hint, tone]) => (
              <div key={label} className="card">
                <p className="text-[11px] text-emerald-200/60">{label}</p>
                <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
                <p className="mt-1 text-[11px] text-emerald-200/50">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3 text-sm font-black text-emerald-100">المبيعات اليومية</h2>
              <div className="flex h-36 items-end gap-1">
                {report.daily.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-emerald-700 to-emerald-400"
                      style={{ height: `${Math.max(4, (d.total / maxDaily) * 100)}%` }}
                      title={`${d.day}: ${formatMoney(d.total)}`}
                    />
                  </div>
                ))}
                {report.daily.length === 0 && (
                  <p className="text-xs text-emerald-200/50">لا بيانات في هذه الفترة</p>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <p className="rounded-lg bg-emerald-900/30 p-2 text-emerald-200/70">
                  سندات قبض: <b className="text-emerald-300">{formatMoney(report.collections)}</b>
                </p>
                <p className="rounded-lg bg-emerald-900/30 p-2 text-emerald-200/70">
                  سندات صرف: <b className="text-rose-300">{formatMoney(report.payments)}</b>
                </p>
                <p className="rounded-lg bg-emerald-900/30 p-2 text-emerald-200/70">
                  مبيعات آجلة: <b className="text-amber-300">{formatMoney(report.sales.credit)}</b>
                </p>
                <p className="rounded-lg bg-emerald-900/30 p-2 text-emerald-200/70">
                  مشتريات آجلة: <b className="text-amber-300">{formatMoney(report.purchases.credit)}</b>
                </p>
              </div>
            </section>

            <section className="card">
              <h2 className="mb-3 text-sm font-black text-emerald-100">المبيعات حسب نوع القات</h2>
              <ul className="space-y-2">
                {report.byType.map((t) => (
                  <li key={t.name} className="rounded-xl bg-emerald-900/30 px-3 py-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-100">{t.name}</span>
                      <span className="font-black text-emerald-300">{formatMoney(t.total)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-emerald-950">
                      <div
                        className="h-full bg-emerald-400"
                        style={{
                          width: `${Math.min(100, (t.total / Math.max(1, report.byType[0]?.total ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-200/50">الكمية: {t.quantity}</p>
                  </li>
                ))}
                {report.byType.length === 0 && (
                  <li className="text-xs text-emerald-200/50">لا بيانات</li>
                )}
              </ul>

              <h2 className="mb-2 mt-4 text-sm font-black text-emerald-100">أداء الموظفين</h2>
              <ul className="space-y-2">
                {report.byUser.map((u) => (
                  <li
                    key={u.name}
                    className="flex justify-between rounded-xl bg-emerald-900/30 px-3 py-2 text-sm"
                  >
                    <span className="text-emerald-100">
                      {u.name} <span className="text-[11px] text-emerald-200/50">({u.count})</span>
                    </span>
                    <span className="font-black text-emerald-300">{formatMoney(u.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-black text-emerald-100">دفتر الحركات المالية</h2>
        <table className="w-full text-right text-xs">
          <thead className="text-emerald-200/50">
            <tr>
              <th className="py-2">التاريخ</th>
              <th>النوع</th>
              <th>الطرف</th>
              <th>المبلغ</th>
              <th>بواسطة</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-t border-emerald-500/10">
                <td className="py-2 text-emerald-200/60">{formatDate(t.transactionDate)}</td>
                <td className="text-emerald-100">{typeLabel[t.transactionType] ?? t.transactionType}</td>
                <td className="text-emerald-200/70">{t.customerName ?? t.supplierName ?? "-"}</td>
                <td className="font-black text-emerald-300">{formatMoney(t.amount)}</td>
                <td className="text-emerald-200/50">{t.userName ?? "-"}</td>
                <td className="text-emerald-200/50">{t.notes ?? "-"}</td>
              </tr>
            ))}
            {txns.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-emerald-200/50">
                  لا توجد حركات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="card text-xs text-rose-200">{message}</p>}
    </div>
  );
}
