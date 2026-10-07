import { ZodError } from "zod";
import { ApiError } from "./auth";

export function ok<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return Response.json({ success: false, message, extra }, { status });
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status);
    if (error instanceof ZodError) {
      return fail("بيانات غير صالحة", 422, error.flatten().fieldErrors);
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "خطأ غير متوقع";
    return fail(message, 500);
  }
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
