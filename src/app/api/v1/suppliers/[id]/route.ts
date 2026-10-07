import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { purchases, suppliers } from "@/db/schema";
import { ApiError, requireRole, requireTenant } from "@/lib/auth";
import { handle, num } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const { id } = await params;
    const [row] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row) throw new ApiError("المورد غير موجود", 404);

    const [stats] = await db
      .select({
        invoices: sql<number>`count(*)`,
        total: sql<string>`coalesce(sum(${purchases.totalAmount}), 0)`,
        lastPurchase: sql<string | null>`max(${purchases.purchaseDate})`,
      })
      .from(purchases)
      .where(and(eq(purchases.tenantId, ctx.tenantId), eq(purchases.supplierId, id)));

    return {
      ...row,
      stats: {
        invoices: Number(stats?.invoices ?? 0),
        total: num(stats?.total),
        lastPurchase: stats?.lastPurchase ?? null,
      },
    };
  });
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const [row] = await db
      .update(suppliers)
      .set(body)
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId)))
      .returning();
    if (!row) throw new ApiError("المورد غير موجود", 404);
    return row;
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    requireRole(ctx, ["owner", "manager"]);
    const { id } = await params;

    const [row] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row) throw new ApiError("المورد غير موجود", 404);
    if (num(row.balance) !== 0) throw new ApiError("لا يمكن حذف مورد له رصيد مستحق", 422);

    await db
      .update(suppliers)
      .set({ isActive: false })
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, ctx.tenantId)));
    return { archived: true };
  });
}
