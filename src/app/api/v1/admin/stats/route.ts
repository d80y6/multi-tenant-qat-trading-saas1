import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  sales,
  subscriptionPayments,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
  users,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth";
import { handle, num } from "@/lib/api";

export const dynamic = "force-dynamic";

/** المؤشرات المالية للمنصة: الإيرادات، التجديدات القادمة، نمو المنشآت. */
export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);

    const [revenue] = await db
      .select({
        total: sql<string>`coalesce(sum(${subscriptionPayments.amount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.status, "paid"));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [monthRevenue] = await db
      .select({ total: sql<string>`coalesce(sum(${subscriptionPayments.amount}), 0)` })
      .from(subscriptionPayments)
      .where(gte(subscriptionPayments.paidAt, monthStart));

    const [counts] = await db
      .select({
        tenants: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${tenants.status} = 'active')`,
        trial: sql<number>`count(*) filter (where ${tenants.subscriptionStatus} = 'trial')`,
        expired: sql<number>`count(*) filter (where ${tenants.subscriptionStatus} = 'expired')`,
      })
      .from(tenants);

    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [gmv] = await db
      .select({ total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)` })
      .from(sales);

    const expiringSoon = await db
      .select({
        id: tenantSubscriptions.id,
        tenantName: tenants.businessName,
        planName: subscriptionPlans.name,
        endDate: tenantSubscriptions.endDate,
        autoRenew: tenantSubscriptions.autoRenew,
      })
      .from(tenantSubscriptions)
      .innerJoin(tenants, eq(tenants.id, tenantSubscriptions.tenantId))
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, tenantSubscriptions.planId))
      .where(eq(tenantSubscriptions.status, "active"))
      .orderBy(tenantSubscriptions.endDate)
      .limit(10);

    const recentPayments = await db
      .select({
        id: subscriptionPayments.id,
        tenantName: tenants.businessName,
        amount: subscriptionPayments.amount,
        paymentMethod: subscriptionPayments.paymentMethod,
        status: subscriptionPayments.status,
        paidAt: subscriptionPayments.paidAt,
        transactionReference: subscriptionPayments.transactionReference,
      })
      .from(subscriptionPayments)
      .innerJoin(tenants, eq(tenants.id, subscriptionPayments.tenantId))
      .orderBy(desc(subscriptionPayments.paidAt))
      .limit(15);

    return {
      revenueTotal: num(revenue?.total),
      revenueMonth: num(monthRevenue?.total),
      paymentsCount: Number(revenue?.count ?? 0),
      tenantsTotal: Number(counts?.tenants ?? 0),
      tenantsActive: Number(counts?.active ?? 0),
      tenantsTrial: Number(counts?.trial ?? 0),
      tenantsExpired: Number(counts?.expired ?? 0),
      usersTotal: Number(userCount?.count ?? 0),
      platformGmv: num(gmv?.total),
      expiringSoon: expiringSoon.map((e) => ({
        ...e,
        daysLeft: Math.ceil((new Date(e.endDate).getTime() - Date.now()) / 86400000),
      })),
      recentPayments: recentPayments.map((p) => ({ ...p, amount: num(p.amount) })),
    };
  });
}
