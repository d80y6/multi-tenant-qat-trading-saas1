import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  subscriptionPayments,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
  users,
} from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle, num } from "@/lib/api";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** حالة اشتراك المنشأة الحالية + الباقات المتاحة + سجل الدفعات. */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);

    const [current] = await db
      .select({
        id: tenantSubscriptions.id,
        planName: subscriptionPlans.name,
        price: subscriptionPlans.price,
        maxUsers: subscriptionPlans.maxUsers,
        features: subscriptionPlans.features,
        startDate: tenantSubscriptions.startDate,
        endDate: tenantSubscriptions.endDate,
        status: tenantSubscriptions.status,
        autoRenew: tenantSubscriptions.autoRenew,
      })
      .from(tenantSubscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, tenantSubscriptions.planId))
      .where(
        and(
          eq(tenantSubscriptions.tenantId, ctx.tenantId),
          eq(tenantSubscriptions.status, "active"),
        ),
      )
      .orderBy(desc(tenantSubscriptions.startDate))
      .limit(1);

    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.price);

    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.tenantId, ctx.tenantId))
      .orderBy(desc(subscriptionPayments.paidAt))
      .limit(20);

    const [usage] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.tenantId, ctx.tenantId));

    const expiresAt = current?.endDate ?? tenant?.trialEndsAt ?? null;
    const daysLeft = expiresAt
      ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
      : null;

    return {
      tenant: {
        businessName: tenant?.businessName,
        subscriptionStatus: tenant?.subscriptionStatus,
        status: tenant?.status,
      },
      current: current
        ? { ...current, price: num(current.price) }
        : null,
      expiresAt,
      daysLeft,
      usersUsed: Number(usage?.count ?? 0),
      maxUsers: current?.maxUsers ?? 2,
      plans: plans.map((p) => ({ ...p, price: num(p.price) })),
      payments,
    };
  });
}
