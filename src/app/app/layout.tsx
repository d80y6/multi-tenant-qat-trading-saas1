import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { readToken } from "@/lib/auth";
import { AppNav, LogoutButton } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = await readToken();
  if (!token || token.scope !== "tenant" || !token.tenantId) redirect("/");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, token.tenantId)).limit(1);
  if (!tenant) redirect("/");

  const trialDaysLeft = tenant.trialEndsAt
    ? Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-24 pt-4 lg:pb-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-emerald-50">{tenant.businessName}</h1>
          <p className="text-[11px] text-emerald-200/60">
            {token.name} · {token.role === "owner" ? "مالك" : token.role === "manager" ? "مدير" : "موظف"}
            {tenant.subscriptionStatus === "trial" && trialDaysLeft !== null
              ? ` · تجربة متبقية ${trialDaysLeft} يوم`
              : tenant.subscriptionStatus === "active"
                ? " · اشتراك فعال"
                : " · الاشتراك منتهي"}
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="hidden lg:mb-4 lg:block">
        <AppNav />
      </div>

      {children}

      <div className="lg:hidden">
        <AppNav />
      </div>
    </div>
  );
}
