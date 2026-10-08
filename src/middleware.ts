import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSecretBytes } from "@/lib/jwt-secret";

const TOKEN_COOKIE = "qat_token";

/**
 * حارس الحافة (Edge Guard):
 * - يمنع الوصول لصفحات /app بدون جلسة مستأجر صالحة.
 * - يمرر tenant_id / user_id / role إلى الطبقة الخلفية عبر ترويسات داخلية
 *   لتسهيل تتبع العزل (العزل الفعلي يُفرض أيضاً داخل requireTenant).
 */
export async function middleware(req: NextRequest) {
  const token =
    req.cookies.get(TOKEN_COOKIE)?.value ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  let payload: Record<string, unknown> | null = null;
  if (token) {
    try {
      payload = (await jwtVerify(token, await getSecretBytes()))
        .payload as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  const { pathname } = req.nextUrl;

  // حدّ حجم جسم الطلب — يحمي الخادم من الحمولات الضخمة
  if (pathname.startsWith("/api") && req.method !== "GET") {
    const declared = Number(req.headers.get("content-length") ?? 0);
    const maxBytes = pathname.startsWith("/api/v1/sync") ? 5_000_000 : 1_000_000;
    if (declared > maxBytes) {
      return NextResponse.json(
        { success: false, message: "حجم الطلب كبير جداً" },
        { status: 413 },
      );
    }
  }

  // سجل طلب بسيط (JSON) مع معرّف يربطه بسجلات النتيجة
  const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      msg: "request",
      requestId,
      method: req.method,
      path: pathname,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
    }),
  );

  if (pathname.startsWith("/app") && (!payload || payload.scope !== "tenant")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  if (payload) {
    headers.set("x-tenant-id", String(payload.tenantId ?? ""));
    headers.set("x-user-id", String(payload.userId ?? ""));
    headers.set("x-user-role", String(payload.role ?? ""));
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/api/v1/:path*"],
};
