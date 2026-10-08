import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  financialTransactions,
  purchaseItems,
  purchases,
  saleItems,
  sales,
  suppliers,
} from "@/db/schema";
import { ApiError, type TenantContext } from "@/lib/auth";
import { money, num } from "@/lib/api";
import { z } from "zod";

export const lineItemSchema = z.object({
  qatTypeId: z.string().uuid().nullable().optional(),
  qatTypeName: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

export const saleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(lineItemSchema).min(1),
  paidAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  saleDate: z.string().optional().nullable(),
  clientUuid: z.string().optional().nullable(),
});

export const purchaseSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  items: z.array(lineItemSchema).min(1),
  paidAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  clientUuid: z.string().optional().nullable(),
});

export const voucherSchema = z.object({
  partyId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  notes: z.string().optional().nullable(),
  transactionDate: z.string().optional().nullable(),
  clientUuid: z.string().optional().nullable(),
});

export type SaleInput = z.infer<typeof saleSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type VoucherInput = z.infer<typeof voucherSchema>;

function parseDate(value?: string | null) {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** تصنيف حالة الدفع: نقداً / جزئي / آجل. */
export function paymentStatusFor(total: number, paid: number): "cash" | "partial" | "credit" {
  // التسامح محدود بأخطاء الفاصلة العائمة فقط (أصغر من قرش واحد)
  if (total - paid <= 0.0001) return "cash";
  if (paid > 0) return "partial";
  return "credit";
}

/** ACID-safe sale creation: invoice + items + customer balance + ledger entry. */
export async function createSale(ctx: TenantContext, input: SaleInput) {
  const total = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const paid = Math.min(num(input.paidAmount), total);
  const remaining = Math.max(total - paid, 0);

  if (remaining > 0 && !input.customerId) {
    throw new ApiError("البيع الآجل يتطلب اختيار عميل", 422);
  }

  return db.transaction(async (tx) => {
    if (input.clientUuid) {
      const [existing] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.tenantId, ctx.tenantId), eq(sales.clientUuid, input.clientUuid)))
        .limit(1);
      if (existing) return { sale: existing, duplicated: true };
    }

    if (input.customerId) {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
        .limit(1);
      if (!customer) throw new ApiError("العميل غير موجود", 404);
    }

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${sales.invoiceNo}), 0) + 1` })
      .from(sales)
      .where(eq(sales.tenantId, ctx.tenantId));

    const [sale] = await tx
      .insert(sales)
      .values({
        tenantId: ctx.tenantId,
        customerId: input.customerId ?? null,
        userId: ctx.userId,
        invoiceNo: Number(next),
        totalAmount: money(total),
        paidAmount: money(paid),
        remainingAmount: money(remaining),
        paymentStatus: paymentStatusFor(total, paid),
        notes: input.notes ?? null,
        saleDate: parseDate(input.saleDate),
        clientUuid: input.clientUuid ?? null,
      })
      .returning();

    await tx.insert(saleItems).values(
      input.items.map((item) => ({
        tenantId: ctx.tenantId,
        saleId: sale.id,
        qatTypeId: item.qatTypeId ?? null,
        qatTypeName: item.qatTypeName,
        quantity: money(item.quantity),
        unitPrice: money(item.unitPrice),
        subtotal: money(item.quantity * item.unitPrice),
      })),
    );

    if (input.customerId && remaining > 0) {
      await tx
        .update(customers)
        .set({ balance: sql`${customers.balance} + ${money(remaining)}` })
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)));
    }

    await tx.insert(financialTransactions).values({
      tenantId: ctx.tenantId,
      partyType: "customer",
      partyId: input.customerId ?? null,
      transactionType: "sale",
      amount: money(total),
      referenceId: sale.id,
      userId: ctx.userId,
      transactionDate: parseDate(input.saleDate),
      notes: input.notes ?? `فاتورة بيع رقم ${sale.invoiceNo}`,
      clientUuid: input.clientUuid ? `${input.clientUuid}:sale` : null,
    });

    // الدفعة النقدية مع الفاتورة تُقيَّد كطرف مقابل حتى يتساوى كشف الحساب مع الرصيد
    if (paid > 0) {
      await tx.insert(financialTransactions).values({
        tenantId: ctx.tenantId,
        partyType: "customer",
        partyId: input.customerId ?? null,
        transactionType: "sale_payment",
        amount: money(paid),
        referenceId: sale.id,
        userId: ctx.userId,
        transactionDate: parseDate(input.saleDate),
        notes: `دفعة نقدية مع فاتورة رقم ${sale.invoiceNo}`,
        clientUuid: input.clientUuid ? `${input.clientUuid}:sale:paid` : null,
      });
    }

    return { sale, duplicated: false };
  });
}

/** ACID-safe purchase creation: invoice + items + supplier balance + ledger entry. */
export async function createPurchase(ctx: TenantContext, input: PurchaseInput) {
  const total = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const paid = Math.min(num(input.paidAmount), total);
  const remaining = Math.max(total - paid, 0);

  if (remaining > 0 && !input.supplierId) {
    throw new ApiError("الشراء الآجل يتطلب اختيار مورد", 422);
  }

  return db.transaction(async (tx) => {
    if (input.clientUuid) {
      const [existing] = await tx
        .select()
        .from(purchases)
        .where(
          and(eq(purchases.tenantId, ctx.tenantId), eq(purchases.clientUuid, input.clientUuid)),
        )
        .limit(1);
      if (existing) return { purchase: existing, duplicated: true };
    }

    if (input.supplierId) {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, ctx.tenantId)))
        .limit(1);
      if (!supplier) throw new ApiError("المورد غير موجود", 404);
    }

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${purchases.invoiceNo}), 0) + 1` })
      .from(purchases)
      .where(eq(purchases.tenantId, ctx.tenantId));

    const [purchase] = await tx
      .insert(purchases)
      .values({
        tenantId: ctx.tenantId,
        supplierId: input.supplierId ?? null,
        userId: ctx.userId,
        invoiceNo: Number(next),
        totalAmount: money(total),
        paidAmount: money(paid),
        remainingAmount: money(remaining),
        paymentStatus: paymentStatusFor(total, paid),
        notes: input.notes ?? null,
        purchaseDate: parseDate(input.purchaseDate),
        clientUuid: input.clientUuid ?? null,
      })
      .returning();

    await tx.insert(purchaseItems).values(
      input.items.map((item) => ({
        tenantId: ctx.tenantId,
        purchaseId: purchase.id,
        qatTypeId: item.qatTypeId ?? null,
        qatTypeName: item.qatTypeName,
        quantity: money(item.quantity),
        unitPrice: money(item.unitPrice),
        subtotal: money(item.quantity * item.unitPrice),
      })),
    );

    if (input.supplierId && remaining > 0) {
      await tx
        .update(suppliers)
        .set({ balance: sql`${suppliers.balance} + ${money(remaining)}` })
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, ctx.tenantId)));
    }

    await tx.insert(financialTransactions).values({
      tenantId: ctx.tenantId,
      partyType: "supplier",
      partyId: input.supplierId ?? null,
      transactionType: "purchase",
      amount: money(total),
      referenceId: purchase.id,
      userId: ctx.userId,
      transactionDate: parseDate(input.purchaseDate),
      notes: input.notes ?? `فاتورة شراء رقم ${purchase.invoiceNo}`,
      clientUuid: input.clientUuid ? `${input.clientUuid}:purchase` : null,
    });

    // الدفعة النقدية مع فاتورة الشراء تُقيَّد كطرف مقابل
    if (paid > 0) {
      await tx.insert(financialTransactions).values({
        tenantId: ctx.tenantId,
        partyType: "supplier",
        partyId: input.supplierId ?? null,
        transactionType: "purchase_payment",
        amount: money(paid),
        referenceId: purchase.id,
        userId: ctx.userId,
        transactionDate: parseDate(input.purchaseDate),
        notes: `دفعة نقدية مع فاتورة شراء رقم ${purchase.invoiceNo}`,
        clientUuid: input.clientUuid ? `${input.clientUuid}:purchase:paid` : null,
      });
    }

    return { purchase, duplicated: false };
  });
}

/** سند قبض — collection from a customer (reduces customer debt). */
export async function createCollection(ctx: TenantContext, input: VoucherInput) {
  return db.transaction(async (tx) => {
    if (input.clientUuid) {
      const [existing] = await tx
        .select()
        .from(financialTransactions)
        .where(
          and(
            eq(financialTransactions.tenantId, ctx.tenantId),
            eq(financialTransactions.clientUuid, input.clientUuid),
          ),
        )
        .limit(1);
      if (existing) return { transaction: existing, duplicated: true };
    }

    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, input.partyId), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!customer) throw new ApiError("العميل غير موجود", 404);

    await tx
      .update(customers)
      .set({ balance: sql`${customers.balance} - ${money(input.amount)}` })
      .where(and(eq(customers.id, customer.id), eq(customers.tenantId, ctx.tenantId)));

    const [transaction] = await tx
      .insert(financialTransactions)
      .values({
        tenantId: ctx.tenantId,
        partyType: "customer",
        partyId: customer.id,
        transactionType: "collection",
        amount: money(input.amount),
        userId: ctx.userId,
        transactionDate: parseDate(input.transactionDate),
        notes: input.notes ?? "سند قبض",
        clientUuid: input.clientUuid ?? null,
      })
      .returning();

    return { transaction, duplicated: false };
  });
}

/** سند صرف — payment to a supplier (reduces what the merchant owes). */
export async function createPayment(ctx: TenantContext, input: VoucherInput) {
  return db.transaction(async (tx) => {
    if (input.clientUuid) {
      const [existing] = await tx
        .select()
        .from(financialTransactions)
        .where(
          and(
            eq(financialTransactions.tenantId, ctx.tenantId),
            eq(financialTransactions.clientUuid, input.clientUuid),
          ),
        )
        .limit(1);
      if (existing) return { transaction: existing, duplicated: true };
    }

    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, input.partyId), eq(suppliers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!supplier) throw new ApiError("المورد غير موجود", 404);

    await tx
      .update(suppliers)
      .set({ balance: sql`${suppliers.balance} - ${money(input.amount)}` })
      .where(and(eq(suppliers.id, supplier.id), eq(suppliers.tenantId, ctx.tenantId)));

    const [transaction] = await tx
      .insert(financialTransactions)
      .values({
        tenantId: ctx.tenantId,
        partyType: "supplier",
        partyId: supplier.id,
        transactionType: "payment",
        amount: money(input.amount),
        userId: ctx.userId,
        transactionDate: parseDate(input.transactionDate),
        notes: input.notes ?? "سند صرف",
        clientUuid: input.clientUuid ?? null,
      })
      .returning();

    return { transaction, duplicated: false };
  });
}
