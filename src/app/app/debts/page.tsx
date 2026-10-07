"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, formatDate, formatMoney, uuid } from "@/lib/client";

type Party = { id: string; name: string; phone: string | null; balance: string };
type StatementLine = {
  id: string;
  date: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
  notes: string | null;
};
type Statement = {
  party: { id: string; name: string; phone: string | null; balance: number; type: string };
  lines: StatementLine[];
};

export default function DebtsPage() {
  const [tab, setTab] = useState<"customer" | "supplier">("customer");
  const [rows, setRows] = useState<Party[]>([]);
  const [q, setQ] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(true);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [voucherFor, setVoucherFor] = useState<Party | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const base = tab === "customer" ? "/api/v1/customers" : "/api/v1/suppliers";
    const flag = tab === "customer" ? "debtors" : "creditors";
    const data = await apiGet<Party[]>(
      `${base}?q=${encodeURIComponent(q)}${onlyDebt ? `&${flag}=1` : ""}`,
    );
    setRows(data);
  }, [tab, q, onlyDebt]);

  useEffect(() => {
    load().catch((e) => setMessage(e instanceof Error ? e.message : "خطأ"));
  }, [load]);

  async function openStatement(party: Party) {
    const data = await apiGet<Statement>(
      `/api/v1/statements?partyType=${tab}&partyId=${party.id}`,
    );
    setStatement(data);
  }

  async function saveVoucher() {
    if (!voucherFor) return;
    const value = Number(amount);
    if (!value || value <= 0) return setMessage("أدخل مبلغاً صحيحاً");
    setBusy(true);
    try {
      const url =
        tab === "customer" ? "/api/v1/vouchers/collections" : "/api/v1/vouchers/payments";
      await apiPost(url, {
        partyId: voucherFor.id,
        amount: value,
        notes,
        clientUuid: uuid(),
      });
      setMessage(
        `${tab === "customer" ? "سند قبض" : "سند صرف"} بمبلغ ${formatMoney(value)} — ${voucherFor.name}`,
      );
      setVoucherFor(null);
      setAmount("");
      setNotes("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  function whatsappLink(s: Statement) {
    const lines = s.lines
      .slice(-10)
      .map(
        (l) =>
          `${formatDate(l.date)} | ${l.label} | ${l.debit ? `مدين ${formatMoney(l.debit)}` : `دائن ${formatMoney(l.credit)}`}`,
      )
      .join("\n");
    const text = `كشف حساب - ${s.party.name}\n${lines}\n\nالرصيد الحالي: ${formatMoney(s.party.balance)} ريال`;
    const phone = (s.party.phone ?? "").replace(/\D/g, "");
    return `https://wa.me/${phone ? `967${phone.replace(/^967/, "")}` : ""}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-950/60 p-1">
        {(["customer", "supplier"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setStatement(null);
            }}
            className={`rounded-lg py-2 text-sm font-black ${tab === t ? "bg-emerald-500 text-emerald-950" : "text-emerald-200"}`}
          >
            {t === "customer" ? "👥 ديون العملاء" : "🚚 مستحقات الموردين"}
          </button>
        ))}
      </div>

      <div className="card space-y-3">
        <div className="flex gap-2">
          <input
            className="field"
            placeholder="بحث..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            onClick={() => setOnlyDebt((v) => !v)}
            className={`btn-ghost shrink-0 ${onlyDebt ? "border-emerald-400 text-emerald-200" : ""}`}
          >
            {onlyDebt ? "المدينون فقط" : "الكل"}
          </button>
        </div>

        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id} className="rounded-xl bg-emerald-900/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-100">{p.name}</p>
                  <p className="text-[11px] text-emerald-200/50">{p.phone ?? "بدون رقم"}</p>
                </div>
                <p
                  className={`text-base font-black ${Number(p.balance) > 0 ? (tab === "customer" ? "text-amber-300" : "text-rose-300") : "text-emerald-300"}`}
                >
                  {formatMoney(p.balance)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => setVoucherFor(p)} className="btn-primary px-3 py-1.5 text-xs">
                  {tab === "customer" ? "سند قبض" : "سند صرف"}
                </button>
                <button onClick={() => openStatement(p)} className="btn-ghost px-3 py-1.5 text-xs">
                  كشف حساب
                </button>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="text-xs text-emerald-200/50">لا توجد نتائج</li>}
        </ul>
      </div>

      {message && <p className="card text-xs text-emerald-200">{message}</p>}

      {voucherFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="card w-full max-w-sm">
            <h3 className="text-sm font-black text-emerald-100">
              {tab === "customer" ? "سند قبض من" : "سند صرف إلى"} {voucherFor.name}
            </h3>
            <p className="mt-1 text-xs text-emerald-200/60">
              الرصيد الحالي: {formatMoney(voucherFor.balance)}
            </p>
            <div className="mt-3 space-y-2">
              <input
                className="field text-lg font-black"
                inputMode="numeric"
                placeholder="المبلغ"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                className="field"
                placeholder="ملاحظات"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setVoucherFor(null)} className="btn-ghost flex-1">
                  إلغاء
                </button>
                <button onClick={saveVoucher} disabled={busy} className="btn-primary flex-1">
                  حفظ السند
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statement && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="card mx-auto w-full max-w-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-emerald-100">
                كشف حساب — {statement.party.name}
              </h3>
              <button onClick={() => setStatement(null)} className="text-xs text-rose-300">
                إغلاق ✕
              </button>
            </div>
            <table className="mt-3 w-full text-right text-[11px]">
              <thead className="text-emerald-200/50">
                <tr>
                  <th className="py-1">التاريخ</th>
                  <th>البيان</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((l) => (
                  <tr key={l.id} className="border-t border-emerald-500/10">
                    <td className="py-1.5 text-emerald-200/70">{formatDate(l.date)}</td>
                    <td className="text-emerald-100">{l.label}</td>
                    <td className="text-amber-300">{l.debit ? formatMoney(l.debit) : "-"}</td>
                    <td className="text-sky-300">{l.credit ? formatMoney(l.credit) : "-"}</td>
                    <td className="font-black text-emerald-200">{formatMoney(l.balance)}</td>
                  </tr>
                ))}
                {statement.lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-emerald-200/50">
                      لا توجد حركات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-black text-emerald-100">
                الرصيد: {formatMoney(statement.party.balance)}
              </p>
              <a
                href={whatsappLink(statement)}
                target="_blank"
                rel="noreferrer"
                className="btn-primary px-3 py-1.5 text-xs"
              >
                💬 مشاركة عبر واتساب
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
