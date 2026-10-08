import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  subscriptionPayments,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
} from "@/db/schema";
import { ApiError, requireTenant } from "@/lib/auth";
import { handle, num } from "@/lib/api";
import { availableProviders, resolveProvider } from "@/lib/payments";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

const schema = z.object({
  planId: z.string().uuid(),
  provider: z.enum(["manual", "stripe"]).default("manual"),
  currency: z.string().length(3).default("YER"),
});

/**
 * بدء عملية دفع لاشتراك/تجديد:
 * يُنشأ اشتراك بحالة `pending` + سند دفع، ويعيد المزوّد إمّا
 * رابط دفع (Stripe Checkout) أو تعليمات التحويل اليدوي.
 * يُفعَّل الاشتراك فقط عند تأكيد الدفع (Webhook أو تأكيد المشرف).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    if (ctx.role !== "owner") throw new ApiError("التجديد متاح لمالك المنشأة فقط", 403);

    const body = schema.parse(await req.json());
    const provider = resolveProvider(body.provider);

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, body.planId))
      .limit(1);
    if (!plan) throw new ApiError("الباقة غير موجودة", 404);
    if (!plan.isActive) throw new ApiError("هذه الباقة متوقفة حالياً", 422);

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    return db.transaction(async (tx) => {
      const [subscription] = await tx
        .insert(tenantSubscriptions)
        .values({
          tenantId: ctx.tenantId,
          planId: plan.id,
          startDate: new Date(),
          endDate: new Date(Date.now() + plan.durationDays * 86400000),
          status: "pending",
          autoRenew: false,
        })
        .returning();

      const reference = `sub-${subscription.id}`;
      const result = await provider.create({
        tenantId: ctx.tenantId,
        reference,
        amount: num(plan.price),
        description: `اشتراك ${plan.name} — ${tenant?.businessName ?? ""}`,
        currency: body.currency,
      });

      const [payment] = await tx
        .insert(subscriptionPayments)
        .values({
          tenantSubscriptionId: subscription.id,
          tenantId: ctx.tenantId,
          amount: plan.price,
          paymentMethod: body.provider === "stripe" ? "card" : "bank",
          transactionReference: result.providerRef,
          status: result.status === "paid" ? "paid" : "pending",
          provider: provider.id,
          checkoutUrl: result.checkoutUrl ?? null,
          providerPayload: (result.raw as Record<string, unknown>) ?? {},
          paidAt: result.status === "paid" ? new Date() : null,
        })
        .returning();

      await tx.insert(auditLogs).values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "checkout_started",
        entity: "subscription_payment",
        entityId: payment.id,
        details: { provider: provider.id, plan: plan.name, amount: num(plan.price) },
      });

      return {
        paymentId: payment.id,
        subscriptionId: subscription.id,
        provider: provider.id,
        status: payment.status,
        checkoutUrl: result.checkoutUrl ?? null,
        instructions: result.instructions ?? null,
        amount: num(plan.price),
        currency: body.currency,
        availableProviders: availableProviders(),
      };
    });
  });
}
