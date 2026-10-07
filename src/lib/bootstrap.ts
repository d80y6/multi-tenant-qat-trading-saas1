import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SCHEMA_STATEMENTS } from "@/db/ddl";
import { platformAdmins } from "@/db/schema";

/**
 * تهيئة ذاتية (Self-Healing Bootstrap):
 * 1) ينشئ المخطط كاملاً بشكل idempotent إن لم يكن موجوداً (CREATE TABLE IF NOT EXISTS ...).
 * 2) يزرع بيانات البداية (مشرف المنصة + الباقات + منشأة تجريبية).
 *
 * يعمل تحت قفل استشاري في PostgreSQL لمنع التسابق بين الطلبات المتزامنة،
 * ولا يخزّن حالة الفشل — أي طلب لاحق يعيد المحاولة.
 */
const LOCK_KEY = 904_112_027;

let inFlight: Promise<BootstrapState> | null = null;
let ready = false;

export type BootstrapState = {
  schemaReady: boolean;
  seeded: boolean;
  error?: string;
};

export async function ensureDatabaseReady(force = false): Promise<BootstrapState> {
  if (ready && !force) return { schemaReady: true, seeded: true };
  if (inFlight) return inFlight;

  inFlight = run(force)
    .then((state) => {
      // النجاح فقط هو ما يُخزَّن — الفشل يُعاد محاولته في الطلب التالي.
      if (state.schemaReady && state.seeded) ready = true;
      return state;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

async function run(force: boolean): Promise<BootstrapState> {
  try {
    await db.execute(sql`select pg_advisory_lock(${LOCK_KEY})`);
    try {
      await ensureSchema();

      const [existing] = await db
        .select({ id: platformAdmins.id })
        .from(platformAdmins)
        .limit(1);

      if (existing && !force) return { schemaReady: true, seeded: true };

      const { seedInitialData } = await import("@/lib/seed");
      await seedInitialData();
      return { schemaReady: true, seeded: true };
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bootstrap] failed:", message);
    return { schemaReady: false, seeded: false, error: message };
  }
}

async function ensureSchema() {
  // فحص سريع: إن كان جدول المستخدمين موجوداً فالمخطط جاهز.
  const probe = await db.execute(sql`select to_regclass('public.users') as t`);
  const rows = probe.rows as { t: string | null }[];
  if (rows[0]?.t) return;

  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  console.log(`[bootstrap] schema created (${SCHEMA_STATEMENTS.length} statements)`);
}

/** تُستخدم في الصفحات/المسارات التي لا يجب أن تفشل بسبب التهيئة. */
export async function ensureDatabaseReadySafe() {
  try {
    return await ensureDatabaseReady();
  } catch {
    return { schemaReady: false, seeded: false } satisfies BootstrapState;
  }
}
