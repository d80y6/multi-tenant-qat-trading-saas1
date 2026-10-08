import { eq, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { ApiError, TOKEN_COOKIE, signToken, verifyPassword } from "@/lib/auth";
import { handle } from "@/lib/api";
import { ensureDatabaseReadySafe } from "@/lib/bootstrap";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/services/audit";

const schema = z.object({
  phone: z.string().min(3, "رقم الجوال مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const state = await ensureDatabaseReadySafe();
    if (!state.schemaReady) {
      throw new ApiError("قاعدة البيانات قيد التهيئة، أعد المحاولة بعد لحظات", 503);
    }

    // حماية من التخمين القسري — طبقتان حتى لا يحجب مستخدمٌ واحد بقية المستخدمين
    const ip = clientIp(req);
    const globalLimit = await rateLimit(`login:${ip}`, 30);
    if (!globalLimit.allowed) {
      throw new ApiError(
        `محاولات كثيرة جداً من هذه الشبكة — أعد المحاولة بعد ${globalLimit.retryAfter} ثانية`,
        429,
      );
    }

    const body = schema.parse(await req.json());
    const raw = body.phone.trim();
    const phone = normalizePhone(raw);

    const accountLimit = await rateLimit(`login:${ip}:${phone}`, 5);
    if (!accountLimit.allowed) {
      throw new ApiError(
        `محاولات كثيرة على هذا الحساب — أعد المحاولة بعد ${accountLimit.retryAfter} ثانية`,
        429,
      );
    }

    // المطابقة على الصيغة الموحدة أو الصيغة المدخلة كما هي
    const [row] = await db
      .select({ user: users, tenant: tenants })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(or(eq(users.phone, phone), eq(users.phone, raw)))
      .limit(1);

    if (!row) {
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
      await logAudit({
        action: "login_failed",
        entity: "auth",
        details: { phone, reason: "unknown_account", ip },
      });
      if (Number(count) === 0) {
        throw new ApiError("لا توجد حسابات بعد — سجّل منشأة جديدة للبدء", 404);
      }
      throw new ApiError("رقم الجوال غير مسجل في المنصة", 401);
    }

    if (!(await verifyPassword(body.password, row.user.passwordHash))) {
      await logAudit({
        tenantId: row.tenant.id,
        action: "login_failed",
        entity: "auth",
        details: { phone, reason: "wrong_password", ip },
      });
      throw new ApiError("كلمة المرور غير صحيحة", 401);
    }
    if (!row.user.isActive) throw new ApiError("تم تعطيل هذا الحساب من قبل المالك", 403);
    if (row.tenant.status !== "active") throw new ApiError("حساب المنشأة موقوف، تواصل مع الدعم", 403);

    // نجاح الدخول يعيد ضبط عدادَي الحماية
    resetRateLimit(`login:${ip}`);
    resetRateLimit(`login:${ip}:${phone}`);

    const token = await signToken({
      scope: "tenant",
      userId: row.user.id,
      tenantId: row.tenant.id,
      role: row.user.role,
      name: row.user.name,
    });

    const store = await cookies();
    store.set(TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      token,
      user: {
        id: row.user.id,
        name: row.user.name,
        phone: row.user.phone,
        role: row.user.role,
      },
      tenant: {
        id: row.tenant.id,
        businessName: row.tenant.businessName,
        subscriptionStatus: row.tenant.subscriptionStatus,
        trialEndsAt: row.tenant.trialEndsAt,
      },
    };
  });
}
