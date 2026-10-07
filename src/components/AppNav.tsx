"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";

const items = [
  { href: "/app", label: "الرئيسية", icon: "🏠" },
  { href: "/app/pos", label: "بيع / شراء", icon: "⚡" },
  { href: "/app/invoices", label: "الفواتير", icon: "🧾" },
  { href: "/app/debts", label: "الديون", icon: "📒" },
  { href: "/app/parties", label: "الحسابات", icon: "👥" },
  { href: "/app/reports", label: "التقارير", icon: "📊" },
  { href: "/app/settings", label: "الإعدادات", icon: "⚙️" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-500/20 bg-emerald-950/95 backdrop-blur print:hidden lg:static lg:border-none lg:bg-transparent">
      <div className="scroll-x mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 py-2 lg:gap-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[11px] font-bold lg:flex-row lg:gap-2 lg:text-sm ${
                active ? "bg-emerald-500 text-emerald-950" : "text-emerald-200/70"
              }`}
            >
              <span className="text-lg lg:text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="rounded-lg border border-emerald-500/25 px-3 py-1.5 text-xs font-bold text-emerald-200"
      onClick={async () => {
        await apiPost("/api/v1/auth/logout", {});
        router.push("/");
        router.refresh();
      }}
    >
      خروج
    </button>
  );
}
