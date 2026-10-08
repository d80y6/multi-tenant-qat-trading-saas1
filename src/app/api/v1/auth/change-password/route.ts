import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ApiError,
  hashPassword,
  requireTenant,
  verifyPassword,
} from "@/lib/auth";
import { handle } from "@/lib/api";
import { assertPasswordStrength } from "@/lib/password";
import { logAudit } from "@/lib/services/audit";

const schema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string().min(4, "كلمة المرور الجديدة قصيرة جداً"),
});

export const dynamic = "force-dynamic";

/** تغيير كلمة المرور الذاتي — متاح لكل الأدوار. */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = schema.parse(await req.json());

    if (body.currentPassword === body.newPassword) {
      throw new ApiError("كلمة المرور الجديدة يجب أن تختلف عن الحالية", 422);
    }
    assertPasswordStrength(body.newPassword);

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

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "password_changed",
      entity: "user",
      entityId: ctx.userId,
      details: { selfService: true },
    });

    return { updated: true };
  });
}
