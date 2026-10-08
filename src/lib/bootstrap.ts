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
  const state =
    ready && !force
      ? { schemaReady: true, seeded: true }
      : await runCore(force);

  if (state.schemaReady) {
    // دورة حياة الاشتراكات (مقيّدة بمرة كل 5 دقائق) — لا تُفشل الطلب أبداً.
    const { runSubscriptionMaintenance } = await import("@/lib/services/subscriptions");
    await runSubscriptionMaintenance().catch((error) =>
      console.error("[bootstrap] maintenance:", error),
    );
  }

  return state;
}

function runCore(force: boolean) {
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

let schemaApplied = false;

/**
 * يطبّق عبارات المخطط (كلها idempotent: IF NOT EXISTS + اعتراض الأخطاء المتكررة)
 * مرة واحدة في عمر العملية، سواء كانت القاعدة فارغة أو قديمة تحتاج ترقية أعمدة.
 */
async function ensureSchema() {
  if (schemaApplied) return;

  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  schemaApplied = true;
  console.log(`[bootstrap] schema ensured (${SCHEMA_STATEMENTS.length} statements)`);
}

/** تُستخدم في الصفحات/المسارات التي لا يجب أن تفشل بسبب التهيئة. */
export async function ensureDatabaseReadySafe() {
  try {
    return await ensureDatabaseReady();
  } catch {
    return { schemaReady: false, seeded: false } satisfies BootstrapState;
  }
}
