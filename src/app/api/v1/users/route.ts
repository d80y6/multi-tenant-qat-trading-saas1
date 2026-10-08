import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  subscriptionPlans,
  tenantSubscriptions,
  users,
} from "@/db/schema";
import {
  ApiError,
  hashPassword,
  requireRole,
  requireTenant,
  verifyPassword,
} from "@/lib/auth";
import { handle } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { assertPasswordStrength } from "@/lib/password";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  password: z.string().min(4),
  role: z.enum(["manager", "worker"]).default("worker"),
});

/** الحد الأقصى لحسابات الموظفين حسب اشتراك المنشأة. */
async function userQuota(tenantId: string) {
  const [subscription] = await db
    .select({ maxUsers: subscriptionPlans.maxUsers })
    .from(tenantSubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, tenantSubscriptions.planId))
    .where(
      and(
        eq(tenantSubscriptions.tenantId, tenantId),
        eq(tenantSubscriptions.status, "active"),
      ),
    )
    .orderBy(desc(tenantSubscriptions.endDate))
    .limit(1);

  const maxUsers = subscription?.maxUsers ?? 2;
  const [{ active }] = await db
    .select({ active: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));

  return { maxUsers, active: Number(active) };
}

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    requireRole(ctx, ["owner", "manager"]);
    return db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.tenantId, ctx.tenantId))
      .orderBy(users.createdAt);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    requireRole(ctx, ["owner"]);
    const body = createSchema.parse(await req.json());

    const phone = normalizePhone(body.phone);
    if (phone.length < 6) throw new ApiError("رقم الجوال غير صالح", 422);
    assertPasswordStrength(body.password);

    // إنفاذ الحد الأقصى للمستخدمين حسب الباقة
    const quota = await userQuota(ctx.tenantId);
    if (quota.active >= quota.maxUsers) {
      throw new ApiError(
        `الحد الأقصى لحسابات الموظفين هو ${quota.maxUsers} حسب الباقة الحالية — قم بترقية الباقة`,
        402,
      );
    }

    const [exists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (exists) throw new ApiError("رقم الجوال مستخدم مسبقاً", 409);

    const [row] = await db
      .insert(users)
      .values({
        tenantId: ctx.tenantId,
        name: body.name,
        phone,
        passwordHash: await hashPassword(body.password),
        role: body.role,
      })
      .returning({ id: users.id, name: users.name, phone: users.phone, role: users.role });

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "user_created",
      entity: "user",
      entityId: row.id,
      details: { name: body.name, role: body.role },
    });

    return row;
  });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  role: z.enum(["owner", "manager", "worker"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(4).optional(),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    requireRole(ctx, ["owner"]);
    const body = patchSchema.parse(await req.json());

    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, body.id), eq(users.tenantId, ctx.tenantId)))
      .limit(1);
    if (!target) throw new ApiError("الحساب غير موجود", 404);

    if (body.password) assertPasswordStrength(body.password);

    if (target.id === ctx.userId && body.isActive === false) {
      throw new ApiError("لا يمكن تعطيل حسابك الخاص", 422);
    }
    if (target.role === "owner" && body.role && body.role !== "owner") {
      throw new ApiError("لا يمكن تغيير صلاحية المالك", 422);
    }
    if (body.isActive === true && target.role === "worker") {
      const quota = await userQuota(ctx.tenantId);
      if (quota.active >= quota.maxUsers) {
        throw new ApiError(
          `الحد الأقصى للحسابات النشطة هو ${quota.maxUsers} حسب الباقة الحالية`,
          402,
        );
      }
    }

    const [row] = await db
      .update(users)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      })
      .where(and(eq(users.id, body.id), eq(users.tenantId, ctx.tenantId)))
      .returning({ id: users.id, name: users.name, role: users.role, isActive: users.isActive });

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "user_updated",
      entity: "user",
      entityId: row.id,
      details: {
        changed: Object.keys(body).filter((k) => k !== "id" && k !== "password"),
        passwordReset: Boolean(body.password),
      },
    });

    return row;
  });
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(4),
});

/** تغيير كلمة المرور الذاتي — لا يتطلب صلاحية المالك. */
export async function PUT(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = changePasswordSchema.parse(await req.json());

    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, ctx.userId), eq(users.tenantId, ctx.tenantId)))
      .limit(1);
    if (!target) throw new ApiError("الحساب غير موجود", 404);

    if (!(await verifyPassword(body.currentPassword, target.passwordHash))) {
      throw new ApiError("كلمة المرور الحالية غير صحيحة", 401);
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword) })
      .where(eq(users.id, target.id));

    return { updated: true };
  });
}
