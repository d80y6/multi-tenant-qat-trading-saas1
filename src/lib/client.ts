"use client";

export type ApiResponse<T> = { success: boolean; data?: T; message?: string; extra?: unknown };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.message ?? "فشل الاتصال بالخادم");
  }
  return body.data as T;
}

export function apiGet<T>(url: string) {
  return request<T>(url);
}

export function apiPost<T>(url: string, data: unknown) {
  return request<T>(url, { method: "POST", body: JSON.stringify(data) });
}

export function apiPatch<T>(url: string, data: unknown) {
  return request<T>(url, { method: "PATCH", body: JSON.stringify(data) });
}

export function formatMoney(value: number | string | null | undefined) {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ar-YE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
