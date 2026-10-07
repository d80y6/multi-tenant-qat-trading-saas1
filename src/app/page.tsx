import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForms from "@/components/AuthForms";
import { readToken } from "@/lib/auth";
import { ensureDatabaseReadySafe } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

const features = [
  { icon: "⚡", title: "نقطة بيع سريعة", desc: "لوحة أرقام ومجموعة أنواع القات بضغطة واحدة" },
  { icon: "🧾", title: "آجل ونقدي وجزئي", desc: "تسجيل الفواتير مع احتساب المتبقي تلقائياً" },
  { icon: "🤝", title: "موردين متعددين", desc: "متابعة ما لك وما عليك مع كل مورد" },
  { icon: "📴", title: "يعمل بدون إنترنت", desc: "تخزين محلي ومزامنة تلقائية عند توفر الشبكة" },
  { icon: "💬", title: "كشف حساب واتساب", desc: "إرسال كشف الدين للعميل برابط مباشر" },
  { icon: "🏢", title: "متعدد المنشآت", desc: "عزل كامل للبيانات بين كل تاجر وآخر" },
];

export default async function HomePage() {
  await ensureDatabaseReadySafe();
  const token = await readToken();
  if (token?.scope === "tenant") redirect("/app");
  if (token?.scope === "platform") redirect("/admin");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-5 py-10 lg:flex-row lg:items-center">
      <section className="flex-1 space-y-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
          🌿 منصة SaaS متعددة المستأجرين
        </span>
        <h1 className="text-4xl font-black leading-tight text-emerald-50 lg:text-5xl">
          قاتي بزنس — نظام إدارة تجارة القات
        </h1>
        <p className="max-w-xl text-sm leading-7 text-emerald-100/70">
          نظام متكامل للمقوتين: بيع وشراء، موردين وعملاء، ديون وسندات قبض وصرف، حسابات موظفين،
          واشتراكات تُدار من لوحة المشرف العام. مصمم للسوق السريع — إدخال الفاتورة خلال ثوانٍ.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 text-sm font-bold text-emerald-100">{f.title}</h3>
              <p className="mt-1 text-xs text-emerald-200/60">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-emerald-200/70">
          <Link href="/admin" className="btn-ghost">
            لوحة المشرف العام
          </Link>
          <Link href="/docs" className="btn-ghost">
            توثيق الـ API وتطبيق Flutter
          </Link>
        </div>
      </section>

      <section className="flex flex-1 justify-center">
        <Suspense fallback={<div className="card w-full max-w-md text-sm text-emerald-200">جارٍ التحميل...</div>}>
          <AuthForms />
        </Suspense>
      </section>
    </main>
  );
}
