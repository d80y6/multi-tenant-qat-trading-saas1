import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { validateEnv } from "@/lib/env";
import { availableProviders } from "@/lib/payments";

export const dynamic = "force-dynamic";

const bootedAt = Date.now();

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ ok: false, db: false }, { status: 500 });
  }
  const dbLatencyMs = Date.now() - started;

  // تهيئة ذاتية: إنشاء المخطط وزرع البيانات إن لزم — لا تُفشل الفحص عند التعثر.
  let bootstrap = { schemaReady: false, seeded: false };
  try {
    bootstrap = await ensureDatabaseReady();
  } catch (error) {
    console.error("bootstrap error", error);
  }

  return Response.json({
    ok: true,
    db: true,
    ...bootstrap,
    dbLatencyMs,
    uptimeSeconds: Math.round((Date.now() - bootedAt) / 1000),
    node: process.version,
    paymentProviders: availableProviders(),
    envWarnings: validateEnv(),
  });
}
