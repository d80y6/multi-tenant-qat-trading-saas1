import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "qat-saas-dev-secret-change-me-please-0001",
);

export const TOKEN_COOKIE = "qat_token";
export const TOKEN_TTL = "30d";

export type TenantRole = "owner" | "manager" | "worker";

export type TokenPayload = {
  scope: "tenant" | "platform";
  userId: string;
  tenantId: string | null;
  role: string;
  name: string;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: TokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(payload.userId)
    .setExpirationTime(TOKEN_TTL)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      scope: payload.scope as "tenant" | "platform",
      userId: payload.userId as string,
      tenantId: (payload.tenantId as string | null) ?? null,
      role: payload.role as string,
      name: (payload.name as string) ?? "",
    };
  } catch {
    return null;
  }
}

/** Reads the JWT from the Authorization header (mobile app) or cookie (web). */
export async function readToken(req?: Request): Promise<TokenPayload | null> {
  const header = req?.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const payload = await verifyToken(token);
    if (payload) return payload;
  }
  const store = await cookies();
  const cookieToken = store.get(TOKEN_COOKIE)?.value;
  if (!cookieToken) return null;
  return verifyToken(cookieToken);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type TenantContext = {
  userId: string;
  tenantId: string;
  role: TenantRole;
  name: string;
  subscriptionStatus?: string;
};

/** Tenant isolation guard: every tenant-scoped query must use ctx.tenantId. */
export async function requireTenant(req?: Request): Promise<TenantContext> {
  const payload = await readToken(req);
  if (!payload || payload.scope !== "tenant" || !payload.tenantId) {
    throw new ApiError("غير مصرح - يرجى تسجيل الدخول", 401);
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
    throw new ApiError("الحساب غير مفعل", 403);
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, payload.tenantId)).limit(1);
  if (!tenant) throw new ApiError("المنشأة غير موجودة", 404);
  if (tenant.status !== "active") {
    throw new ApiError("تم إيقاف حساب المنشأة، تواصل مع الدعم", 403);
  }

  // انتهاء الفترة التجريبية يُحدَّث تلقائياً إلى "expired"
  let subscriptionStatus = tenant.subscriptionStatus;
  if (
    subscriptionStatus === "trial" &&
    tenant.trialEndsAt &&
    new Date(tenant.trialEndsAt).getTime() < Date.now()
  ) {
    subscriptionStatus = "expired";
    await db
      .update(tenants)
      .set({ subscriptionStatus: "expired" })
      .where(eq(tenants.id, tenant.id));
  }

  // القراءة مسموحة دائماً، أما الكتابة فتتطلب اشتراكاً سارياً
  const method = (req?.method ?? "GET").toUpperCase();
  if (subscriptionStatus === "expired" && method !== "GET") {
    throw new ApiError("انتهى اشتراك المنشأة — يرجى التجديد لمتابعة التسجيل", 402);
  }

  return {
    userId: user.id,
    tenantId: tenant.id,
    role: user.role as TenantRole,
    name: user.name,
    subscriptionStatus,
  };
}

export function requireRole(ctx: TenantContext, roles: TenantRole[]) {
  if (!roles.includes(ctx.role)) {
    throw new ApiError("لا تملك صلاحية لهذا الإجراء", 403);
  }
}

export async function requirePlatformAdmin(req?: Request) {
  const payload = await readToken(req);
  if (!payload || payload.scope !== "platform") {
    throw new ApiError("غير مصرح - دخول المشرف مطلوب", 401);
  }
  return payload;
}
