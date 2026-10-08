import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, financialTransactions, suppliers } from "@/db/schema";
import { ApiError, type TenantContext } from "@/lib/auth";
import { num } from "@/lib/api";

export type StatementLine = {
  id: string;
  date: string;
  type: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
  notes: string | null;
};

export async function getStatement(
  ctx: TenantContext,
  partyType: "customer" | "supplier",
  partyId: string,
) {
  const party =
    partyType === "customer"
      ? (
          await db
            .select()
            .from(customers)
            .where(and(eq(customers.id, partyId), eq(customers.tenantId, ctx.tenantId)))
            .limit(1)
        )[0]
      : (
          await db
            .select()
            .from(suppliers)
            .where(and(eq(suppliers.id, partyId), eq(suppliers.tenantId, ctx.tenantId)))
            .limit(1)
        )[0];

  if (!party) throw new ApiError("الحساب غير موجود", 404);

  const rows = await db
    .select()
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.tenantId, ctx.tenantId),
        eq(financialTransactions.partyType, partyType),
        eq(financialTransactions.partyId, partyId),
      ),
    )
    .orderBy(asc(financialTransactions.transactionDate));

  let balance = 0;
  const lines: StatementLine[] = rows.map((row) => {
    const amount = num(row.amount);
    let debit = 0;
    let credit = 0;
    let label = "";

    if (row.transactionType === "sale") {
      debit = amount;
      label = "فاتورة بيع";
    } else if (row.transactionType === "sale_payment") {
      credit = amount;
      label = "دفعة نقدية مع فاتورة";
    } else if (row.transactionType === "collection") {
      credit = amount;
      label = "سند قبض";
    } else if (row.transactionType === "purchase") {
      credit = amount;
      label = "فاتورة شراء";
    } else if (row.transactionType === "purchase_payment") {
      debit = amount;
      label = "دفعة نقدية لفاتورة شراء";
    } else if (row.transactionType === "payment") {
      debit = amount;
      label = "سند صرف";
    } else {
      debit = amount;
      label = "قيد تسوية";
    }

    balance += debit - credit;
    return {
      id: row.id,
      date: row.transactionDate.toISOString(),
      type: row.transactionType,
      label,
      debit,
      credit,
      balance,
      notes: row.notes,
    };
  });

  return {
    party: {
      id: party.id,
      name: party.name,
      phone: party.phone,
      balance: num(party.balance),
      type: partyType,
    },
    lines,
  };
}
