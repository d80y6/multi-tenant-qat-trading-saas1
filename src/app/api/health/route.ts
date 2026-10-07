import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureDatabaseReady } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ ok: false, db: false }, { status: 500 });
  }

  // تهيئة ذاتية: إنشاء المخطط وزرع البيانات إن لزم — لا تُفشل الفحص عند التعثر.
  let bootstrap = { schemaReady: false, seeded: false };
  try {
    bootstrap = await ensureDatabaseReady();
  } catch (error) {
    console.error("bootstrap error", error);
  }

  return Response.json({ ok: true, db: true, ...bootstrap });
}
