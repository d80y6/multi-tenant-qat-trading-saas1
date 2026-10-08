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

const numbers = [
  { value: "٣", label: "ثوانٍ لإصدار فاتورة" },
  { value: "16", label: "جدولاً معزولاً بالكامل" },
  { value: "∞", label: "فواتير بلا إنترنت" },
];

export default async function HomePage() {
  await ensureDatabaseReadySafe();
  const token = await readToken();
  if (token?.scope === "tenant") redirect("/app");
  if (token?.scope === "platform") redirect("/admin");

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* الخلفية: صورة سوق القات + تدرّج يضمن قراءة النص */}
      <div className="absolute inset-0 -z-10">
        <img
          src="images/qat-souq.jpg"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-[75%_center] opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-emerald-950/70 via-emerald-950/92 to-emerald-950" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#04100c] to-transparent" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-12 lg:flex-row lg:items-center lg:py-16">
        <section className="flex-1 space-y-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
            🌿 منصة SaaS متعددة المستأجرين
          </span>

          <h1 className="text-[2.6rem] font-black leading-[1.12] text-emerald-50 sm:text-5xl lg:text-[3.4rem]">
            قاتي بزنس
            <span className="mt-2 block text-emerald-300/90">
              نظام إدارة تجارة القات
            </span>
          </h1>

          <p className="max-w-xl text-[15px] leading-8 text-emerald-100/75">
            نظام متكامل للمقوتين: بيع وشراء، موردين وعملاء، ديون وسندات قبض وصرف، حسابات
            موظفين، واشتراكات تُدار من لوحة المشرف العام. مصمّم للسوق السريع — إدخال الفاتورة
            خلال ثوانٍ، حتى لو انقطع الإنترنت.
          </p>

          <div className="flex items-center gap-6">
            {numbers.map((n) => (
              <div key={n.label}>
                <p className="text-2xl font-black text-emerald-300">{n.value}</p>
                <p className="text-[11px] text-emerald-200/60">{n.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-emerald-200/80">
            <Link href="/docs" className="btn-ghost">
              📘 توثيق الـ API وتطبيق Flutter
            </Link>
            <Link href="/admin" className="btn-ghost">
              🛡️ لوحة المشرف العام
            </Link>
          </div>
        </section>

        <section className="flex flex-1 justify-center">
          <Suspense
            fallback={
              <div className="card w-full max-w-md text-sm text-emerald-200">جارٍ التحميل...</div>
            }
          >
            <AuthForms />
          </Suspense>
        </section>
      </div>

      {/* شريط المزايا على نسيج الأوراق */}
      <section className="relative overflow-hidden border-t border-emerald-500/10">
        <img
          src="images/qat-texture.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-[#04100c]/85" />
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 px-5 py-10 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-emerald-500/12 bg-emerald-950/45 p-4 backdrop-blur-sm"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 text-sm font-bold text-emerald-100">{f.title}</h3>
              <p className="mt-1 text-xs leading-6 text-emerald-200/65">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
