import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { purchases, suppliers } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createPurchase, purchaseSchema } from "@/lib/services/trading";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const limit = Number(url.searchParams.get("limit") ?? 50);

    const filters = [eq(purchases.tenantId, ctx.tenantId)];
    if (since) filters.push(gte(purchases.purchaseDate, new Date(since)));

    return db
      .select({
        id: purchases.id,
        invoiceNo: purchases.invoiceNo,
        totalAmount: purchases.totalAmount,
        paidAmount: purchases.paidAmount,
        remainingAmount: purchases.remainingAmount,
        paymentStatus: purchases.paymentStatus,
        purchaseDate: purchases.purchaseDate,
        notes: purchases.notes,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
      })
      .from(purchases)
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(and(...filters))
      .orderBy(desc(purchases.purchaseDate))
      .limit(Math.min(Math.max(limit, 1), 500));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = purchaseSchema.parse(await req.json());
    return createPurchase(ctx, body);
  });
}
