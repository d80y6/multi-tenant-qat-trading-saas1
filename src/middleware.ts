import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "qat-saas-dev-secret-change-me-please-0001",
);

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
      payload = (await jwtVerify(token, SECRET)).payload as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/app") && (!payload || payload.scope !== "tenant")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
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
