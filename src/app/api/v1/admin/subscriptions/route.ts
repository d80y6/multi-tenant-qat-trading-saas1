import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  subscriptionPayments,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
} from "@/db/schema";
import { ApiError, requirePlatformAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    return db
      .select({
        id: tenantSubscriptions.id,
        tenantId: tenantSubscriptions.tenantId,
        tenantName: tenants.businessName,
        planName: subscriptionPlans.name,
        price: subscriptionPlans.price,
        startDate: tenantSubscriptions.startDate,
        endDate: tenantSubscriptions.endDate,
        status: tenantSubscriptions.status,
        autoRenew: tenantSubscriptions.autoRenew,
      })
      .from(tenantSubscriptions)
      .innerJoin(tenants, eq(tenants.id, tenantSubscriptions.tenantId))
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, tenantSubscriptions.planId))
      .orderBy(desc(tenantSubscriptions.startDate))
      .limit(100);
  });
}

const schema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  autoRenew: z.boolean().default(false),
  paymentMethod: z.enum(["cash", "bank", "wallet"]).default("cash"),
  transactionReference: z.string().optional().nullable(),
});

/** Activate / renew a tenant subscription and record the platform payment. */
export async function POST(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const body = schema.parse(await req.json());

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, body.planId))
      .limit(1);
    if (!plan) throw new ApiError("الباقة غير موجودة", 404);

    return db.transaction(async (tx) => {
      await tx
        .update(tenantSubscriptions)
        .set({ status: "expired" })
        .where(eq(tenantSubscriptions.tenantId, body.tenantId));

      const [subscription] = await tx
        .insert(tenantSubscriptions)
        .values({
          tenantId: body.tenantId,
          planId: plan.id,
          startDate: new Date(),
          endDate: new Date(Date.now() + plan.durationDays * 86400000),
          status: "active",
          autoRenew: body.autoRenew,
        })
        .returning();

      await tx.insert(subscriptionPayments).values({
        tenantSubscriptionId: subscription.id,
        tenantId: body.tenantId,
        amount: plan.price,
        paymentMethod: body.paymentMethod,
        transactionReference: body.transactionReference ?? null,
        status: "paid",
      });

      await tx
        .update(tenants)
        .set({ subscriptionStatus: "active", status: "active" })
        .where(eq(tenants.id, body.tenantId));

      return subscription;
    });
  });
}
