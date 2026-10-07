import Link from "next/link";
import { requireTenant } from "@/lib/auth";
import { getDashboard } from "@/lib/services/reports";
import { fmt } from "@/lib/api";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  tone = "emerald",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "amber" | "rose" | "sky";
}) {
  const tones = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
  } as const;
  return (
    <div className="card">
      <p className="text-[11px] font-bold text-emerald-200/60">{label}</p>
      <p className={`mt-1 text-xl font-black ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-emerald-200/50">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const data = await getDashboard(ctx);
  const maxWeekly = Math.max(1, ...data.weekly.map((w) => w.total));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="مبيعات اليوم"
          value={fmt(data.salesToday.total)}
          hint={`${data.salesToday.count} فاتورة`}
        />
        <Stat
          label="نقدي محصّل اليوم"
          value={fmt(data.salesToday.paid + data.collectedToday)}
          hint={`سندات قبض: ${fmt(data.collectedToday)}`}
          tone="sky"
        />
        <Stat label="لك على العملاء" value={fmt(data.receivables)} hint="إجمالي الذمم المدينة" tone="amber" />
        <Stat label="عليك للموردين" value={fmt(data.payables)} hint="إجمالي الذمم الدائنة" tone="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-sm font-black text-emerald-100">مبيعات آخر 7 أيام</h2>
          <div className="flex h-36 items-end justify-between gap-2">
            {data.weekly.length === 0 && (
              <p className="text-xs text-emerald-200/50">لا توجد مبيعات بعد</p>
            )}
            {data.weekly.map((w) => (
              <div key={w.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-400"
                  style={{ height: `${Math.max(6, (w.total / maxWeekly) * 100)}%` }}
                  title={`${w.day}: ${fmt(w.total)}`}
                />
                <span className="text-[9px] text-emerald-200/50">{w.day.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/app/pos" className="btn-primary flex-1">
              ⚡ فاتورة بيع سريعة
            </Link>
            <Link href="/app/debts" className="btn-ghost flex-1">
              📒 تحصيل دين
            </Link>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 text-sm font-black text-emerald-100">أعلى المديونيات</h2>
          <ul className="space-y-2">
            {data.topDebtors.length === 0 && (
              <li className="text-xs text-emerald-200/50">لا توجد ديون على العملاء 🎉</li>
            )}
            {data.topDebtors.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2"
              >
                <span className="text-sm text-emerald-100">{d.name}</span>
                <span className="text-sm font-black text-amber-300">{fmt(d.balance)}</span>
              </li>
            ))}
          </ul>
          <h2 className="mb-2 mt-4 text-sm font-black text-emerald-100">مستحقات الموردين</h2>
          <ul className="space-y-2">
            {data.topCreditors.length === 0 && (
              <li className="text-xs text-emerald-200/50">لا توجد مستحقات للموردين</li>
            )}
            {data.topCreditors.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl bg-emerald-900/30 px-3 py-2"
              >
                <span className="text-sm text-emerald-100">{d.name}</span>
                <span className="text-sm font-black text-rose-300">{fmt(d.balance)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 text-sm font-black text-emerald-100">آخر الفواتير</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-emerald-200/50">
              <tr>
                <th className="py-2">#</th>
                <th>العميل</th>
                <th>الإجمالي</th>
                <th>المتبقي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map((s) => (
                <tr key={s.id} className="border-t border-emerald-500/10">
                  <td className="py-2 font-bold text-emerald-200">{s.invoiceNo}</td>
                  <td className="text-emerald-100">{s.customerName ?? "نقدي"}</td>
                  <td className="font-bold text-emerald-300">{fmt(s.totalAmount)}</td>
                  <td className="font-bold text-amber-300">{fmt(s.remainingAmount)}</td>
                  <td>
                    <span className="rounded-md bg-emerald-900/60 px-2 py-0.5 text-[10px] text-emerald-200">
                      {s.paymentStatus === "cash" ? "نقدي" : s.paymentStatus === "partial" ? "جزئي" : "آجل"}
                    </span>
                  </td>
                </tr>
              ))}
              {data.recentSales.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-emerald-200/50">
                    لا توجد فواتير
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
