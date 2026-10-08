/**
 * مفتاح توقيع JWT — بترتيب الأولويات:
 *
 * 1) متغير البيئة `JWT_SECRET` (المطلوب في الإنتاج، طوله 16 حرفاً فأكثر).
 * 2) في الإنتاج بدون متغير: مفتاح مشتق بالتجزئة (SHA-256) من `DATABASE_URL`
 *    الخاصة بالنشر — ليس قيمة ثابتة معروفة في الكود — مع تحذير واضح في السجلات.
 * 3) في التطوير فقط: مفتاح تطوير ثابت.
 *
 * يعمل في Node وفي Edge (middleware) عبر Web Crypto.
 */
const DEV_SECRET = "qat-saas-dev-secret-change-me-please-0001";

let cached: Uint8Array | null = null;
let warned = false;

export async function getSecretBytes(): Promise<Uint8Array> {
  if (cached) return cached;

  const configured = process.env.JWT_SECRET?.trim();
  if (configured && configured.length >= 16) {
    cached = new TextEncoder().encode(configured);
    return cached;
  }

  if (process.env.NODE_ENV === "production") {
    if (!warned) {
      warned = true;
      console.warn(
        "[security] JWT_SECRET غير مضبوط — يُستخدم مفتاح مشتق من DATABASE_URL. " +
          "للاستخدام الفعلي أضف JWT_SECRET (32 حرفاً عشوائياً على الأقل) في متغيرات البيئة.",
      );
    }
    const material = `qati-business:${process.env.DATABASE_URL ?? "local"}`;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(material),
    );
    cached = new Uint8Array(digest);
    return cached;
  }

  cached = new TextEncoder().encode(DEV_SECRET);
  return cached;
}
