import { sql } from "drizzle-orm";
import { db } from "@/db";
import { platformAdmins, tenants, users } from "@/db/schema";
import { handle } from "@/lib/api";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { DEMO_CREDENTIALS } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** تشخيص حالة النظام — يفيد عند تعذر تسجيل الدخول. */
export async function GET() {
  return handle(async () => {
    const state = await ensureDatabaseReady();

    let counts = { admins: 0, tenants: 0, users: 0 };
    if (state.schemaReady) {
      const [a] = await db.select({ c: sql<number>`count(*)` }).from(platformAdmins);
      const [t] = await db.select({ c: sql<number>`count(*)` }).from(tenants);
      const [u] = await db.select({ c: sql<number>`count(*)` }).from(users);
      counts = { admins: Number(a?.c ?? 0), tenants: Number(t?.c ?? 0), users: Number(u?.c ?? 0) };
    }

    return {
      schemaReady: state.schemaReady,
      seeded: state.seeded,
      error: state.error ?? null,
      counts,
      canLogin: counts.users > 0,
      demo: DEMO_CREDENTIALS,
    };
  });
}

/** إعادة تشغيل التهيئة يدوياً (إنشاء المخطط + زرع البيانات الناقصة). */
export async function POST() {
  return handle(async () => {
    const state = await ensureDatabaseReady(true);
    const [u] = await db.select({ c: sql<number>`count(*)` }).from(users);
    return { ...state, users: Number(u?.c ?? 0), demo: DEMO_CREDENTIALS };
  });
}
