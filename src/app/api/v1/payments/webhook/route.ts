import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPayments } from "@/db/schema";
import { handle } from "@/lib/api";
import { ApiError } from "@/lib/auth";
import { PROVIDERS, type PaymentProvider } from "@/lib/payments";
import { logAudit } from "@/lib/services/audit";
import { activateSubscription } from "@/lib/services/subscriptions";

export const dynamic = "force-dynamic";

/**
 * نقطة استقبال إشعارات بوابات الدفع (Stripe وغيرها).
 * التحقق من التوقيع إلزامي — يُرفض أي طلب غير موقّع.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const rawBody = await req.text();
    const providerName = new URL(req.url).searchParams.get("provider") ?? "stripe";
    const provider = PROVIDERS[providerName as keyof typeof PROVIDERS] as
      | PaymentProvider
      | undefined;

    if (!provider) throw new Error("بوابة غير معروفة");

    const event = await provider.verifyWebhook(req, rawBody);
    if (!event) {
      // لا يُقبل أي إشعار غير موقّع أو منتهي الصلاحية
      throw new ApiError("توقيع غير صالح أو غير مكتمل", 400);
    }

    const [payment] = await db
      .select()
      .from(subscriptionPayments)
      .where(
        and(
          eq(subscriptionPayments.provider, event.provider),
          eq(subscriptionPayments.transactionReference, event.providerRef),
        ),
      )
      .limit(1);

    if (!payment) {
      throw new ApiError("عملية دفع غير موجودة", 404);
    }

    if (payment.status === "paid") {
      return { alreadyProcessed: true };
    }

    await db
      .update(subscriptionPayments)
      .set({
        status: event.status === "paid" ? "paid" : event.status,
        paidAt: event.status === "paid" ? new Date() : null,
      })
      .where(eq(subscriptionPayments.id, payment.id));

    if (event.status === "paid") {
      await activateSubscription(payment.tenantSubscriptionId, payment.tenantId);
    }

    await logAudit({
      tenantId: payment.tenantId,
      actorScope: "platform",
      action: `payment_${event.status}`,
      entity: "subscription_payment",
      entityId: payment.id,
      details: { provider: event.provider, providerRef: event.providerRef },
    });

    return { received: true };
  });
}


