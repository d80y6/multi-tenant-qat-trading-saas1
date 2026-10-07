"use client";

import { formatDate, formatMoney } from "@/lib/client";

export type ReceiptItem = {
  id: string;
  qatTypeName: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
};

export type ReceiptData = {
  kind: "sale" | "purchase";
  businessName: string;
  ownerPhone: string | null;
  partyName: string | null;
  partyPhone: string | null;
  userName: string | null;
  invoiceNo: number;
  date: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentStatus: string;
  notes: string | null;
  items: ReceiptItem[];
};

const statusLabel: Record<string, string> = {
  cash: "نقدي",
  partial: "دفع جزئي",
  credit: "آجل",
};

/**
 * إيصال بعرض 80mm جاهز للطباعة الحرارية (نفس تخطيط طابعة البلوتوث في تطبيق Flutter).
 */
export default function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div
      id="thermal-receipt"
      className="mx-auto w-[300px] rounded-xl bg-white p-4 font-mono text-[12px] leading-5 text-black"
    >
      <div className="text-center">
        <p className="text-base font-black">{data.businessName}</p>
        {data.ownerPhone && <p>{data.ownerPhone}</p>}
        <p className="mt-1 border-y border-dashed border-black py-1 font-bold">
          {data.kind === "sale" ? "فاتورة بيع" : "فاتورة شراء"} #{data.invoiceNo}
        </p>
      </div>

      <div className="mt-2 space-y-0.5">
        <p>التاريخ: {formatDate(data.date)}</p>
        <p>
          {data.kind === "sale" ? "العميل" : "المورد"}: {data.partyName ?? "نقدي"}
        </p>
        {data.partyPhone && <p>الجوال: {data.partyPhone}</p>}
        {data.userName && <p>الكاشير: {data.userName}</p>}
      </div>

      <table className="mt-2 w-full border-y border-dashed border-black text-right">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="py-1">الصنف</th>
            <th>كمية</th>
            <th>سعر</th>
            <th>مبلغ</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td className="py-0.5">{item.qatTypeName}</td>
              <td>{formatMoney(item.quantity)}</td>
              <td>{formatMoney(item.unitPrice)}</td>
              <td>{formatMoney(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 space-y-0.5">
        <div className="flex justify-between font-black">
          <span>الإجمالي</span>
          <span>{formatMoney(data.totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>المدفوع</span>
          <span>{formatMoney(data.paidAmount)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>المتبقي</span>
          <span>{formatMoney(data.remainingAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>طريقة الدفع</span>
          <span>{statusLabel[data.paymentStatus] ?? data.paymentStatus}</span>
        </div>
      </div>

      {data.notes && <p className="mt-2 border-t border-dashed border-black pt-1">{data.notes}</p>}

      <p className="mt-3 text-center">شكراً لتعاملكم معنا 🌿</p>
      <p className="text-center text-[10px]">قاتي بزنس — نظام إدارة تجارة القات</p>
    </div>
  );
}
