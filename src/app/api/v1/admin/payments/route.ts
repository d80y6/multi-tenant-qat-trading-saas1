import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  subscriptionPayments,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
} from "@/db/schema";
import { ApiError, requirePlatformAdmin } from "@/lib/auth";
import { handle, num } from "@/lib/api";
import { activateSubscription } from "@/lib/services/subscriptions";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

/** سجل عمليات الدفع لكل المنشآت مع فلترة بالحالة. */
export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const status = new URL(req.url).searchParams.get("status");

    const filters = [];
    if (status) filters.push(eq(subscriptionPayments.status, status));

    return db
      .select({
        id: subscriptionPayments.id,
        tenantName: tenants.businessName,
        planName: subscriptionPlans.name,
        amount: subscriptionPayments.amount,
        paymentMethod: subscriptionPayments.paymentMethod,
        provider: subscriptionPayments.provider,
        transactionReference: subscriptionPayments.transactionReference,
        checkoutUrl: subscriptionPayments.checkoutUrl,
        status: subscriptionPayments.status,
        paidAt: subscriptionPayments.paidAt,
        createdAt: subscriptionPayments.createdAt,
      })
      .from(subscriptionPayments)
      .innerJoin(tenants, eq(tenants.id, subscriptionPayments.tenantId))
      .leftJoin(
        tenantSubscriptions,
        eq(tenantSubscriptions.id, subscriptionPayments.tenantSubscriptionId),
      )
      .leftJoin(subscriptionPlans, eq(subscriptionPlans.id, tenantSubscriptions.planId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(200);
  });
}

const actionSchema = z.object({
  paymentId: z.string().uuid(),
  action: z.enum(["confirm", "reject"]),
  note: z.string().optional().nullable(),
});

/**
 * تأكيد/رفض دفعة يدوية (تحويل بنكي أو نقداً).
 * التأكيد يفعّل الاشتراك المرتبط ويحدّث حالة المنشأة فوراً.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requirePlatformAdmin(req);
    const body = actionSchema.parse(await req.json());

    const [payment] = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.id, body.paymentId))
      .limit(1);
    if (!payment) throw new ApiError("عملية الدفع غير موجودة", 404);
    if (payment.status !== "pending") {
      throw new ApiError(`الدفعة بحالة ${payment.status} ولا يمكن تعديلها`, 422);
    }

    if (body.action === "confirm") {
      await db
        .update(subscriptionPayments)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(subscriptionPayments.id, payment.id));

      await activateSubscription(payment.tenantSubscriptionId, payment.tenantId);

      await logAudit({
        tenantId: payment.tenantId,
        userId: actor.userId,
        actorScope: "platform",
        action: "payment_confirmed",
        entity: "subscription_payment",
        entityId: payment.id,
        details: { amount: num(payment.amount), note: body.note ?? null },
      });

      return { confirmed: true, amount: num(payment.amount) };
    }

    await db
      .update(subscriptionPayments)
      .set({ status: "failed" })
      .where(eq(subscriptionPayments.id, payment.id));

    await logAudit({
      tenantId: payment.tenantId,
      userId: actor.userId,
      actorScope: "platform",
      action: "payment_rejected",
      entity: "subscription_payment",
      entityId: payment.id,
      details: { note: body.note ?? null },
    });

    return { rejected: true };
  });
}
