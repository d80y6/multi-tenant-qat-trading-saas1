import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  financialTransactions,
  purchases,
  saleItems,
  sales,
  suppliers,
  users,
} from "@/db/schema";
import type { TenantContext } from "@/lib/auth";
import { num } from "@/lib/api";

export type PeriodReport = Awaited<ReturnType<typeof getPeriodReport>>;

/** تقرير فترة: المبيعات، المشتريات، التحصيلات، المصروفات، الربح التقديري، وحسب النوع. */
export async function getPeriodReport(ctx: TenantContext, from: Date, to: Date) {
  const [salesAgg] = await db
    .select({
      total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      paid: sql<string>`coalesce(sum(${sales.paidAmount}), 0)`,
      credit: sql<string>`coalesce(sum(${sales.remainingAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(sales)
    .where(
      and(eq(sales.tenantId, ctx.tenantId), gte(sales.saleDate, from), lte(sales.saleDate, to)),
    );

  const [purchasesAgg] = await db
    .select({
      total: sql<string>`coalesce(sum(${purchases.totalAmount}), 0)`,
      paid: sql<string>`coalesce(sum(${purchases.paidAmount}), 0)`,
      credit: sql<string>`coalesce(sum(${purchases.remainingAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.tenantId, ctx.tenantId),
        gte(purchases.purchaseDate, from),
        lte(purchases.purchaseDate, to),
      ),
    );

  const vouchers = await db
    .select({
      type: financialTransactions.transactionType,
      total: sql<string>`coalesce(sum(${financialTransactions.amount}), 0)`,
    })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.tenantId, ctx.tenantId),
        gte(financialTransactions.transactionDate, from),
        lte(financialTransactions.transactionDate, to),
      ),
    )
    .groupBy(financialTransactions.transactionType);

  const byType = await db
    .select({
      name: saleItems.qatTypeName,
      quantity: sql<string>`coalesce(sum(${saleItems.quantity}), 0)`,
      total: sql<string>`coalesce(sum(${saleItems.subtotal}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(
      and(
        eq(saleItems.tenantId, ctx.tenantId),
        gte(sales.saleDate, from),
        lte(sales.saleDate, to),
      ),
    )
    .groupBy(saleItems.qatTypeName)
    .orderBy(sql`sum(${saleItems.subtotal}) desc`);

  const daily = await db
    .select({
      day: sql<string>`to_char(${sales.saleDate}, 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(sales)
    .where(
      and(eq(sales.tenantId, ctx.tenantId), gte(sales.saleDate, from), lte(sales.saleDate, to)),
    )
    .groupBy(sql`to_char(${sales.saleDate}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${sales.saleDate}, 'YYYY-MM-DD')`);

  const byUser = await db
    .select({
      name: users.name,
      total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .where(
      and(eq(sales.tenantId, ctx.tenantId), gte(sales.saleDate, from), lte(sales.saleDate, to)),
    )
    .groupBy(users.name)
    .orderBy(sql`sum(${sales.totalAmount}) desc`);

  const collections = num(vouchers.find((v) => v.type === "collection")?.total);
  const payments = num(vouchers.find((v) => v.type === "payment")?.total);
  const salesTotal = num(salesAgg?.total);
  const purchasesTotal = num(purchasesAgg?.total);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    sales: {
      total: salesTotal,
      paid: num(salesAgg?.paid),
      credit: num(salesAgg?.credit),
      count: Number(salesAgg?.count ?? 0),
    },
    purchases: {
      total: purchasesTotal,
      paid: num(purchasesAgg?.paid),
      credit: num(purchasesAgg?.credit),
      count: Number(purchasesAgg?.count ?? 0),
    },
    collections,
    payments,
    grossProfit: salesTotal - purchasesTotal,
    netCash: num(salesAgg?.paid) + collections - num(purchasesAgg?.paid) - payments,
    byType: byType.map((t) => ({
      name: t.name,
      quantity: num(t.quantity),
      total: num(t.total),
    })),
    byUser: byUser.map((u) => ({
      name: u.name ?? "غير محدد",
      total: num(u.total),
      count: Number(u.count ?? 0),
    })),
    daily: daily.map((d) => ({ day: d.day, total: num(d.total), count: Number(d.count ?? 0) })),
  };
}

export async function getDashboard(ctx: TenantContext) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [salesToday] = await db
    .select({
      total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      paid: sql<string>`coalesce(sum(${sales.paidAmount}), 0)`,
      credit: sql<string>`coalesce(sum(${sales.remainingAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, ctx.tenantId), gte(sales.saleDate, startOfDay)));

  const [purchasesToday] = await db
    .select({
      total: sql<string>`coalesce(sum(${purchases.totalAmount}), 0)`,
      paid: sql<string>`coalesce(sum(${purchases.paidAmount}), 0)`,
      credit: sql<string>`coalesce(sum(${purchases.remainingAmount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(purchases)
    .where(and(eq(purchases.tenantId, ctx.tenantId), gte(purchases.purchaseDate, startOfDay)));

  const [receivables] = await db
    .select({ total: sql<string>`coalesce(sum(${customers.balance}), 0)` })
    .from(customers)
    .where(eq(customers.tenantId, ctx.tenantId));

  const [payables] = await db
    .select({ total: sql<string>`coalesce(sum(${suppliers.balance}), 0)` })
    .from(suppliers)
    .where(eq(suppliers.tenantId, ctx.tenantId));

  const [collectedToday] = await db
    .select({ total: sql<string>`coalesce(sum(${financialTransactions.amount}), 0)` })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.tenantId, ctx.tenantId),
        eq(financialTransactions.transactionType, "collection"),
        gte(financialTransactions.transactionDate, startOfDay),
      ),
    );

  const topDebtors = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, balance: customers.balance })
    .from(customers)
    .where(and(eq(customers.tenantId, ctx.tenantId), sql`${customers.balance} > 0`))
    .orderBy(desc(customers.balance))
    .limit(5);

  const topCreditors = await db
    .select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone, balance: suppliers.balance })
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, ctx.tenantId), sql`${suppliers.balance} > 0`))
    .orderBy(desc(suppliers.balance))
    .limit(5);

  const recentSales = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      totalAmount: sales.totalAmount,
      remainingAmount: sales.remainingAmount,
      paymentStatus: sales.paymentStatus,
      saleDate: sales.saleDate,
      customerName: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.tenantId, ctx.tenantId))
    .orderBy(desc(sales.saleDate))
    .limit(8);

  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  weekAgo.setHours(0, 0, 0, 0);
  const weekly = await db
    .select({
      day: sql<string>`to_char(${sales.saleDate}, 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, ctx.tenantId), gte(sales.saleDate, weekAgo)))
    .groupBy(sql`to_char(${sales.saleDate}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${sales.saleDate}, 'YYYY-MM-DD')`);

  return {
    salesToday: {
      total: num(salesToday?.total),
      paid: num(salesToday?.paid),
      credit: num(salesToday?.credit),
      count: Number(salesToday?.count ?? 0),
    },
    purchasesToday: {
      total: num(purchasesToday?.total),
      paid: num(purchasesToday?.paid),
      credit: num(purchasesToday?.credit),
      count: Number(purchasesToday?.count ?? 0),
    },
    receivables: num(receivables?.total),
    payables: num(payables?.total),
    collectedToday: num(collectedToday?.total),
    topDebtors: topDebtors.map((d) => ({ ...d, balance: num(d.balance) })),
    topCreditors: topCreditors.map((d) => ({ ...d, balance: num(d.balance) })),
    recentSales,
    weekly: weekly.map((w) => ({ day: w.day, total: num(w.total) })),
  };
}
