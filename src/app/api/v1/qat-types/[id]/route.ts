import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { qatTypes } from "@/db/schema";
import { ApiError, requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  defaultPrice: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const [row] = await db
      .update(qatTypes)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.defaultPrice !== undefined
          ? { defaultPrice: body.defaultPrice.toFixed(2) }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      })
      .where(and(eq(qatTypes.id, id), eq(qatTypes.tenantId, ctx.tenantId)))
      .returning();
    if (!row) throw new ApiError("النوع غير موجود", 404);
    return row;
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const { id } = await params;
    const [row] = await db
      .update(qatTypes)
      .set({ isActive: false })
      .where(and(eq(qatTypes.id, id), eq(qatTypes.tenantId, ctx.tenantId)))
      .returning();
    if (!row) throw new ApiError("النوع غير موجود", 404);
    return { archived: true };
  });
}
