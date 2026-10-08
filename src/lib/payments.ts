import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * طبقة بوابات الدفع — تصميم قابل للتبديل (Pluggable):
 *
 * - `manual`  : تحويل بنكي / نقدي — يعمل فوراً بأي تاجر، ويؤكد المشرف الاستلام.
 * - `stripe`  : بطاقة/محفظة عبر Stripe Checkout، يتفعّل تلقائياً عند وجود
 *               `STRIPE_SECRET_KEY` و`STRIPE_WEBHOOK_SECRET`.
 *
 * إضافة مزوّد جديد = تنفيذ `PaymentProvider` وتسجيله في `PROVIDERS`.
 */

export type ProviderId = "manual" | "stripe";

export type CreatePaymentInput = {
  tenantId: string;
  reference: string; // معرف داخلي (اشتراك / فاتورة)
  amount: number;
  description: string;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type CreatePaymentResult = {
  provider: ProviderId;
  providerRef: string;
  status: "pending" | "paid";
  checkoutUrl?: string;
  instructions?: string;
  raw?: unknown;
};

export type WebhookEvent = {
  provider: ProviderId;
  providerRef: string;
  status: "paid" | "failed" | "refunded";
  amount?: number;
  raw?: unknown;
};

export interface PaymentProvider {
  id: ProviderId;
  isAvailable(): boolean;
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** يتحقق من صحة الطلب القادم من المزوّد ويعيد الحدث أو null. */
  verifyWebhook(req: Request, rawBody: string): Promise<WebhookEvent | null>;
}

/* ------------------------------------------------------------------ */
/* مزوّد يدوي: تحويل بنكي / استلام نقدي                                */
/* ------------------------------------------------------------------ */

const MANUAL_INSTRUCTIONS =
  process.env.BANK_ACCOUNT_DETAILS ??
  "حوّل المبلغ إلى حساب المنصة البنكي ثم أرسل رقم الحوالة إلى الدعم الفني لتأكيد التفعيل.";

export const manualProvider: PaymentProvider = {
  id: "manual",

  isAvailable() {
    return true;
  },

  async create(input) {
    return {
      provider: "manual",
      providerRef: `manual-${input.reference}-${Date.now()}`,
      status: "pending",
      instructions: `${MANUAL_INSTRUCTIONS}\nالمبلغ المطلوب: ${input.amount} ${input.currency ?? "YER"}\nالمرجع: ${input.reference}`,
      raw: { amount: input.amount, reference: input.reference },
    };
  },

  async verifyWebhook() {
    // المزوّد اليدوي لا يرسل Webhooks — التأكيد يتم من لوحة المشرف.
    return null;
  },
};

/* ------------------------------------------------------------------ */
/* مزوّد Stripe عبر REST مباشرة (بدون حزم خارجية)                      */
/* ------------------------------------------------------------------ */

function stripeSecret() {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  isAvailable() {
    return Boolean(stripeSecret());
  },

  async create(input) {
    const key = stripeSecret();
    if (!key) throw new Error("STRIPE_SECRET_KEY غير مضبوط");

    const currency = (input.currency ?? "usd").toLowerCase();
    // Stripe تتوقع أصغر وحدة للعملة (سنتات)
    const unitAmount = Math.round(input.amount * 100);

    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(unitAmount),
      "line_items[0][price_data][product_data][name]": input.description,
      success_url: input.successUrl ?? "https://example.com/payments/success",
      cancel_url: input.cancelUrl ?? "https://example.com/payments/cancel",
      "metadata[tenantId]": input.tenantId,
      "metadata[reference]": input.reference,
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const session = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const message = (session.error as { message?: string } | undefined)?.message;
      throw new Error(`Stripe: ${message ?? res.statusText}`);
    }

    return {
      provider: "stripe",
      providerRef: String(session.id),
      status: "pending",
      checkoutUrl: String(session.url),
      raw: session,
    };
  },

  async verifyWebhook(req, rawBody) {
    const secret = stripeWebhookSecret();
    const header = req.headers.get("stripe-signature");
    if (!secret || !header) return null;

    const parts = Object.fromEntries(
      header.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
    );
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return null;

    // رفض الطلبات الأقدم من 5 دقائق (حماية من إعادة الإرسال)
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > 300) return null;

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const object = event.data?.object ?? {};
    const providerRef = String(object.id ?? "");

    if (event.type === "checkout.session.completed") {
      return {
        provider: "stripe",
        providerRef,
        status: "paid",
        amount: Number(object.amount_total ?? 0) / 100,
        raw: event,
      };
    }
    if (event.type === "charge.refunded") {
      return { provider: "stripe", providerRef, status: "refunded", raw: event };
    }
    return null;
  },
};

/* ------------------------------------------------------------------ */

export const PROVIDERS: Record<ProviderId, PaymentProvider> = {
  manual: manualProvider,
  stripe: stripeProvider,
};

/** المزوّدون المتاحون فعلياً في هذه البيئة (لمعاينة خيارات الدفع). */
export function availableProviders(): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((id) =>
    PROVIDERS[id].isAvailable(),
  );
}

export function resolveProvider(id?: string | null): PaymentProvider {
  const key = (id ?? "manual") as ProviderId;
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`بوابة دفع غير معروفة: ${id}`);
  if (!provider.isAvailable()) throw new Error(`بوابة الدفع ${key} غير مهيّأة في هذه البيئة`);
  return provider;
}
