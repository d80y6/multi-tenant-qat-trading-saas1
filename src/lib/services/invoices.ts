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
  tenants,
  users,
} from "@/db/schema";
import { ApiError, type TenantContext } from "@/lib/auth";
import { money, num } from "@/lib/api";

export async function getSaleDetail(ctx: TenantContext, id: string) {
  const [row] = await db
    .select({
      sale: sales,
      customerName: customers.name,
      customerPhone: customers.phone,
      userName: users.name,
      businessName: tenants.businessName,
      ownerPhone: tenants.phone,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(users, eq(users.id, sales.userId))
    .innerJoin(tenants, eq(tenants.id, sales.tenantId))
    .where(and(eq(sales.id, id), eq(sales.tenantId, ctx.tenantId)))
    .limit(1);

  if (!row) throw new ApiError("الفاتورة غير موجودة", 404);

  const items = await db
    .select()
    .from(saleItems)
    .where(and(eq(saleItems.saleId, id), eq(saleItems.tenantId, ctx.tenantId)));

  return { kind: "sale" as const, ...row, items };
}

export async function getPurchaseDetail(ctx: TenantContext, id: string) {
  const [row] = await db
    .select({
      purchase: purchases,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      userName: users.name,
      businessName: tenants.businessName,
      ownerPhone: tenants.phone,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(users, eq(users.id, purchases.userId))
    .innerJoin(tenants, eq(tenants.id, purchases.tenantId))
    .where(and(eq(purchases.id, id), eq(purchases.tenantId, ctx.tenantId)))
    .limit(1);

  if (!row) throw new ApiError("الفاتورة غير موجودة", 404);

  const items = await db
    .select()
    .from(purchaseItems)
    .where(and(eq(purchaseItems.purchaseId, id), eq(purchaseItems.tenantId, ctx.tenantId)));

  return { kind: "purchase" as const, ...row, items };
}

/** إلغاء فاتورة بيع مع عكس أثرها على رصيد العميل والقيد المالي (داخل معاملة واحدة). */
export async function voidSale(ctx: TenantContext, id: string) {
  return db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.tenantId, ctx.tenantId)))
      .limit(1);
    if (!sale) throw new ApiError("الفاتورة غير موجودة", 404);

    const remaining = num(sale.remainingAmount);
    if (sale.customerId && remaining > 0) {
      await tx
        .update(customers)
        .set({ balance: sql`${customers.balance} - ${money(remaining)}` })
        .where(and(eq(customers.id, sale.customerId), eq(customers.tenantId, ctx.tenantId)));
    }

    await tx
      .delete(financialTransactions)
      .where(
        and(
          eq(financialTransactions.tenantId, ctx.tenantId),
          eq(financialTransactions.referenceId, sale.id),
        ),
      );

    await tx.delete(sales).where(and(eq(sales.id, sale.id), eq(sales.tenantId, ctx.tenantId)));
    return { voided: true, invoiceNo: sale.invoiceNo };
  });
}

/** إلغاء فاتورة شراء مع عكس أثرها على رصيد المورد. */
export async function voidPurchase(ctx: TenantContext, id: string) {
  return db.transaction(async (tx) => {
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, id), eq(purchases.tenantId, ctx.tenantId)))
      .limit(1);
    if (!purchase) throw new ApiError("الفاتورة غير موجودة", 404);

    const remaining = num(purchase.remainingAmount);
    if (purchase.supplierId && remaining > 0) {
      await tx
        .update(suppliers)
        .set({ balance: sql`${suppliers.balance} - ${money(remaining)}` })
        .where(and(eq(suppliers.id, purchase.supplierId), eq(suppliers.tenantId, ctx.tenantId)));
    }

    await tx
      .delete(financialTransactions)
      .where(
        and(
          eq(financialTransactions.tenantId, ctx.tenantId),
          eq(financialTransactions.referenceId, purchase.id),
        ),
      );

    await tx
      .delete(purchases)
      .where(and(eq(purchases.id, purchase.id), eq(purchases.tenantId, ctx.tenantId)));
    return { voided: true, invoiceNo: purchase.invoiceNo };
  });
}
