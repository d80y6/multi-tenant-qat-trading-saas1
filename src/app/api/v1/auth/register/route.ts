import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { ApiError, TOKEN_COOKIE, hashPassword, signToken } from "@/lib/auth";
import { handle } from "@/lib/api";
import { ensureDatabaseReadySafe } from "@/lib/bootstrap";
import { normalizePhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { assertPasswordStrength } from "@/lib/password";
import { seedTenantDefaults } from "@/lib/seed";

const schema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  phone: z.string().min(6),
  city: z.string().optional().nullable(),
  password: z.string().min(4),
});

const TRIAL_DAYS = 14;

export async function POST(req: Request) {
  return handle(async () => {
    await ensureDatabaseReadySafe();

    // منع الإنشاء الجماعي للمنشآت
    const limit = await rateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      throw new ApiError(
        `تم تجاوز الحد المسموح — أعد المحاولة بعد ${Math.ceil(limit.retryAfter / 60)} دقيقة`,
        429,
      );
    }

    const body = schema.parse(await req.json());
    const phone = normalizePhone(body.phone);
    if (phone.length < 6) throw new ApiError("رقم الجوال غير صالح", 422);
    assertPasswordStrength(body.password);

    const [existingUser] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existingUser) throw new ApiError("رقم الجوال مسجل مسبقاً — سجّل الدخول بدلاً من ذلك", 409);

    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          businessName: body.businessName,
          ownerName: body.ownerName,
          phone,
          city: body.city ?? null,
          status: "active",
          subscriptionStatus: "trial",
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        })
        .returning();

      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          name: body.ownerName,
          phone,
          passwordHash: await hashPassword(body.password),
          role: "owner",
        })
        .returning();

      return { tenant, owner };
    });

    await seedTenantDefaults(result.tenant.id);

    const token = await signToken({
      scope: "tenant",
      userId: result.owner.id,
      tenantId: result.tenant.id,
      role: "owner",
      name: result.owner.name,
    });

    const store = await cookies();
    store.set(TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return { token, tenant: result.tenant, user: { id: result.owner.id, role: "owner" } };
  });
}
