import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, hashPassword, requireRole, requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  password: z.string().min(4),
  role: z.enum(["manager", "worker"]).default("worker"),
});

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

    return row;
  });
}

const patchSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export async function PATCH(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    requireRole(ctx, ["owner"]);
    const body = patchSchema.parse(await req.json());
    if (body.id === ctx.userId) throw new ApiError("لا يمكن تعطيل حسابك الخاص", 422);
    const [row] = await db
      .update(users)
      .set({ isActive: body.isActive })
      .where(and(eq(users.id, body.id), eq(users.tenantId, ctx.tenantId)))
      .returning({ id: users.id, isActive: users.isActive });
    return row;
  });
}
