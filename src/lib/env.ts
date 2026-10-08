/**
 * التحقق من متغيرات البيئة المطلوبة للتشغيل — يُستدعى عند التهيئة.
 * يعيد قائمة تنبيهات بدل أن يُسقط الخادم، حتى تعمل البيئات التجريبية،
 * لكن يُسجَّل تحذير واضح لكل غياب.
 */

export type EnvWarning = { key: string; message: string; severity: "critical" | "warning" };

export function validateEnv(): EnvWarning[] {
  const warnings: EnvWarning[] = [];
  const production = process.env.NODE_ENV === "production";

  if (!process.env.DATABASE_URL) {
    warnings.push({ key: "DATABASE_URL", message: "اتصال قاعدة البيانات غير معرف", severity: "critical" });
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    warnings.push({
      key: "JWT_SECRET",
      message:
        production
          ? "غير مضبوط أو قصير — أنشئ مفتاحاً عشوائياً (32 حرفاً فأكثر) قبل الإطلاق، وإلا فلا يمكن التحكم بتدوير الجلسات"
          : "غير مضبوط (بيئة تطوير) — ضبطه قبل الإنتاج",
      severity: production ? "critical" : "warning",
    });
  }

  if (production && !process.env.REDIS_URL) {
    warnings.push({
      key: "REDIS_URL",
      message: "حدّ المحاولات يعمل داخل الذاكرة فقط — لا يكفي للنشر متعدد الخوادم",
      severity: "warning",
    });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    warnings.push({
      key: "STRIPE_SECRET_KEY",
      message: "بوابة البطاقات غير مهيّأة — الدفع اليدوي (تحويل بنكي) يعمل فقط",
      severity: "warning",
    });
  } else if (!process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push({
      key: "STRIPE_WEBHOOK_SECRET",
      message: "سر الـ Webhook غير معرف — لن يتم تفعيل الاشتراكات تلقائياً بعد الدفع",
      severity: "warning",
    });
  }

  return warnings;
}
