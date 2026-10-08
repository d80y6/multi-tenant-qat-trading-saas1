import { ZodError } from "zod";
import { ApiError } from "./auth";

export function ok<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return Response.json({ success: false, message, extra }, { status });
}

/**
 * غلاف كل مسارات الـ API: يقيس زمن الاستجابة ويسجّل السجلات بصيغة JSON
 * قابلة للتحليل (Observability) ويعيد أخطاء مفهومة للمستخدم.
 */
export async function handle<T>(fn: () => Promise<T>) {
  const started = Date.now();
  const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const data = await fn();
    log({ level: "info", requestId, ok: true, status: 200, ms: Date.now() - started });
    return ok(data);
  } catch (error) {
    if (error instanceof ApiError) {
      log({
        level: "warn",
        requestId,
        ok: false,
        status: error.status,
        ms: Date.now() - started,
        message: error.message,
      });
      return fail(error.message, error.status);
    }
    if (error instanceof ZodError) {
      log({
        level: "warn",
        requestId,
        ok: false,
        status: 422,
        ms: Date.now() - started,
        message: "validation_error",
      });
      return fail("بيانات غير صالحة", 422, error.flatten().fieldErrors);
    }

    const message = error instanceof Error ? error.message : "خطأ غير متوقع";
    log({
      level: "error",
      requestId,
      ok: false,
      status: 500,
      ms: Date.now() - started,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fail(message, 500);
  }
}

function log(entry: Record<string, unknown>) {
  // سطر JSON واحد لكل طلب — يُلتقط مباشرة بواسطة أي جامع سجلات
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}

export function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function fmt(value: unknown): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 }).format(num(value));
}
