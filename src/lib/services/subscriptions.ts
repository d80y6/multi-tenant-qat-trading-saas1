import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  subscriptionPayments,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
} from "@/db/schema";

export type MaintenanceResult = {
  expired: number;
  renewed: number;
  trialsClosed: number;
  skipped: boolean;
};

let lastRun = 0;
const THROTTLE_MS = 5 * 60 * 1000;

/**
 * دورة حياة الاشتراكات (تُنفَّذ كسولة بحد أقصى مرة كل 5 دقائق لكل عملية):
 *
 * 1) إنهاء التجارب المنتهية: `subscription_status: trial -> expired`.
 * 2) انتهاء الاشتراكات: أي اشتراك تجاوز `end_date` يصبح `expired`.
 * 3) التجديد التلقائي: إن كان `autoRenew = true` والباقة ما زالت متاحة،
 *    يُنشأ اشتراك جديد + سند دفع ويبقى التاجر في حالة `active`.
 *    وإلا تنتقل المنشأة إلى `expired` فتوقف عمليات الكتابة (402).
 */
export async function runSubscriptionMaintenance(force = false): Promise<MaintenanceResult> {
  const now = Date.now();
  if (!force && now - lastRun < THROTTLE_MS) {
    return { expired: 0, renewed: 0, trialsClosed: 0, skipped: true };
  }
  lastRun = now;

  // 1) انتهاء التجارب
  const closedTrials = await db
    .update(tenants)
    .set({ subscriptionStatus: "expired" })
    .where(
      and(
        eq(tenants.subscriptionStatus, "trial"),
        lt(tenants.trialEndsAt, new Date()),
      ),
    )
    .returning({ id: tenants.id });

  // 2) الاشتراكات المنتهية
  const overdue = await db
    .select({
      subscription: tenantSubscriptions,
      plan: subscriptionPlans,
    })
    .from(tenantSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, tenantSubscriptions.planId))
    .where(
      and(
        eq(tenantSubscriptions.status, "active"),
        lt(tenantSubscriptions.endDate, new Date()),
      ),
    );

  let expired = 0;
  let renewed = 0;

  for (const row of overdue) {
    const canRenew = row.subscription.autoRenew && row.plan.isActive;

    if (canRenew) {
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + row.plan.durationDays * 86400000);
      const [next] = await db
        .insert(tenantSubscriptions)
        .values({
          tenantId: row.subscription.tenantId,
          planId: row.plan.id,
          startDate,
          endDate,
          status: "active",
          autoRenew: true,
        })
        .returning();

      await db.insert(subscriptionPayments).values({
        tenantSubscriptionId: next.id,
        tenantId: row.subscription.tenantId,
        amount: row.plan.price,
        paymentMethod: "auto",
        transactionReference: `auto-renew:${next.id}`,
        status: "paid",
      });

      await db
        .update(tenantSubscriptions)
        .set({ status: "expired" })
        .where(eq(tenantSubscriptions.id, row.subscription.id));

      await db
        .update(tenants)
        .set({ subscriptionStatus: "active" })
        .where(eq(tenants.id, row.subscription.tenantId));

      renewed++;
    } else {
      await db
        .update(tenantSubscriptions)
        .set({ status: "expired" })
        .where(eq(tenantSubscriptions.id, row.subscription.id));

      await db
        .update(tenants)
        .set({ subscriptionStatus: "expired" })
        .where(eq(tenants.id, row.subscription.tenantId));

      expired++;
    }
  }

  return { expired, renewed, trialsClosed: closedTrials.length, skipped: false };
}

/** تفعيل اشتراك بعد نجاح الدفع + إنهاء الاشتراكات السابقة. */
export async function activateSubscription(subscriptionId: string, tenantId: string) {
  await db
    .update(tenantSubscriptions)
    .set({ status: "expired" })
    .where(
      and(
        eq(tenantSubscriptions.tenantId, tenantId),
        eq(tenantSubscriptions.status, "active"),
      ),
    );

  await db
    .update(tenantSubscriptions)
    .set({ status: "active" })
    .where(eq(tenantSubscriptions.id, subscriptionId));

  await db
    .update(tenants)
    .set({ subscriptionStatus: "active", status: "active" })
    .where(eq(tenants.id, tenantId));

  return true;
}

/** أرقام تراكمية صغيرة لعرض حالة الاشتراك. */
export async function subscriptionHealth() {
  const [row] = await db.select({
    active: sql<number>`count(*) filter (where ${tenants.subscriptionStatus} = 'active')`,
    trial: sql<number>`count(*) filter (where ${tenants.subscriptionStatus} = 'trial')`,
    expired: sql<number>`count(*) filter (where ${tenants.subscriptionStatus} = 'expired')`,
  }).from(tenants);
  return row ?? { active: 0, trial: 0, expired: 0 };
}
