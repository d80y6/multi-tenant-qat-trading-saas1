import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
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
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row) throw new ApiError("العميل غير موجود", 404);

    const [stats] = await db
      .select({
        invoices: sql<number>`count(*)`,
        total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
        lastSale: sql<string | null>`max(${sales.saleDate})`,
      })
      .from(sales)
      .where(and(eq(sales.tenantId, ctx.tenantId), eq(sales.customerId, id)));

    return {
      ...row,
      stats: {
        invoices: Number(stats?.invoices ?? 0),
        total: num(stats?.total),
        lastSale: stats?.lastSale ?? null,
      },
    };
  });
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const [row] = await db
      .update(customers)
      .set(body)
      .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
      .returning();
    if (!row) throw new ApiError("العميل غير موجود", 404);
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
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
      .limit(1);
    if (!row) throw new ApiError("العميل غير موجود", 404);
    if (num(row.balance) !== 0) throw new ApiError("لا يمكن حذف عميل عليه رصيد مستحق", 422);

    await db
      .update(customers)
      .set({ isActive: false })
      .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)));
    return { archived: true };
  });
}
