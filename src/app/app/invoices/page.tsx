"use client";

import { useCallback, useEffect, useState } from "react";
import Receipt, { type ReceiptData, type ReceiptItem } from "@/components/Receipt";
import { apiGet, formatDate, formatMoney } from "@/lib/client";

type SaleRow = {
  id: string;
  invoiceNo: number;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: string;
  saleDate: string;
  notes: string | null;
  customerName: string | null;
};

type PurchaseRow = {
  id: string;
  invoiceNo: number;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: string;
  purchaseDate: string;
  notes: string | null;
  supplierName: string | null;
};

type SaleDetail = {
  kind: "sale";
  sale: SaleRow & { saleDate: string };
  customerName: string | null;
  customerPhone: string | null;
  userName: string | null;
  businessName: string;
  ownerPhone: string | null;
  items: ReceiptItem[];
};

type PurchaseDetail = {
  kind: "purchase";
  purchase: PurchaseRow & { purchaseDate: string };
  supplierName: string | null;
  supplierPhone: string | null;
  userName: string | null;
  businessName: string;
  ownerPhone: string | null;
  items: ReceiptItem[];
};

const statusLabel: Record<string, string> = { cash: "نقدي", partial: "جزئي", credit: "آجل" };

export default function InvoicesPage() {
  const [tab, setTab] = useState<"sale" | "purchase">("sale");
  const [rows, setRows] = useState<(SaleRow | PurchaseRow)[]>([]);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const url = tab === "sale" ? "/api/v1/sales?limit=100" : "/api/v1/purchases?limit=100";
    setRows(await apiGet<(SaleRow | PurchaseRow)[]>(url));
  }, [tab]);

  useEffect(() => {
    load().catch((e) => setMessage(e instanceof Error ? e.message : "خطأ"));
  }, [load]);

  async function openDetail(id: string) {
    const url = tab === "sale" ? `/api/v1/sales/${id}` : `/api/v1/purchases/${id}`;
    const data = await apiGet<SaleDetail | PurchaseDetail>(url);
    setDetailId(id);
    if (data.kind === "sale") {
      setReceipt({
        kind: "sale",
        businessName: data.businessName,
        ownerPhone: data.ownerPhone,
        partyName: data.customerName,
        partyPhone: data.customerPhone,
        userName: data.userName,
        invoiceNo: data.sale.invoiceNo,
        date: data.sale.saleDate,
        totalAmount: data.sale.totalAmount,
        paidAmount: data.sale.paidAmount,
        remainingAmount: data.sale.remainingAmount,
        paymentStatus: data.sale.paymentStatus,
        notes: data.sale.notes,
        items: data.items,
      });
    } else {
      setReceipt({
        kind: "purchase",
        businessName: data.businessName,
        ownerPhone: data.ownerPhone,
        partyName: data.supplierName,
        partyPhone: data.supplierPhone,
        userName: data.userName,
        invoiceNo: data.purchase.invoiceNo,
        date: data.purchase.purchaseDate,
        totalAmount: data.purchase.totalAmount,
        paidAmount: data.purchase.paidAmount,
        remainingAmount: data.purchase.remainingAmount,
        paymentStatus: data.purchase.paymentStatus,
        notes: data.purchase.notes,
        items: data.items,
      });
    }
  }

  async function voidInvoice() {
    if (!detailId) return;
    if (!confirm("سيتم إلغاء الفاتورة وعكس أثرها على الرصيد. متابعة؟")) return;
    setBusy(true);
    try {
      const url = tab === "sale" ? `/api/v1/sales/${detailId}` : `/api/v1/purchases/${detailId}`;
      const res = await fetch(url, { method: "DELETE" });
      const body = await res.json();
      if (!body.success) throw new Error(body.message);
      setMessage("تم إلغاء الفاتورة وعكس القيود");
      setReceipt(null);
      setDetailId(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-emerald-950/60 p-1 print:hidden">
        {(["sale", "purchase"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-black ${tab === t ? "bg-emerald-500 text-emerald-950" : "text-emerald-200"}`}
          >
            {t === "sale" ? "🧾 فواتير البيع" : "📦 فواتير الشراء"}
          </button>
        ))}
      </div>

      <section className="card overflow-x-auto print:hidden">
        <table className="w-full text-right text-xs">
          <thead className="text-emerald-200/50">
            <tr>
              <th className="py-2">#</th>
              <th>{tab === "sale" ? "العميل" : "المورد"}</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const party = "customerName" in r ? r.customerName : r.supplierName;
              const date = "saleDate" in r ? r.saleDate : r.purchaseDate;
              return (
                <tr key={r.id} className="border-t border-emerald-500/10">
                  <td className="py-2 font-bold text-emerald-200">{r.invoiceNo}</td>
                  <td className="text-emerald-100">{party ?? "نقدي"}</td>
                  <td className="text-emerald-200/60">{formatDate(date)}</td>
                  <td className="font-bold text-emerald-300">{formatMoney(r.totalAmount)}</td>
                  <td className="text-sky-300">{formatMoney(r.paidAmount)}</td>
                  <td className="text-amber-300">{formatMoney(r.remainingAmount)}</td>
                  <td>
                    <span className="rounded-md bg-emerald-900/60 px-2 py-0.5 text-[10px] text-emerald-200">
                      {statusLabel[r.paymentStatus]}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => openDetail(r.id)}
                      className="rounded-lg border border-emerald-500/25 px-2 py-1 text-[11px] text-emerald-200"
                    >
                      عرض / طباعة
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-emerald-200/50">
                  لا توجد فواتير
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {message && <p className="card text-xs text-emerald-200 print:hidden">{message}</p>}

      {receipt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 print:static print:bg-white print:p-0">
          <div className="mx-auto max-w-sm space-y-3">
            <Receipt data={receipt} />
            <div className="flex gap-2 print:hidden">
              <button
                onClick={() => {
                  setReceipt(null);
                  setDetailId(null);
                }}
                className="btn-ghost flex-1"
              >
                إغلاق
              </button>
              <button onClick={() => window.print()} className="btn-primary flex-1">
                🖨️ طباعة
              </button>
              <button onClick={voidInvoice} disabled={busy} className="btn-danger flex-1">
                إلغاء الفاتورة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
