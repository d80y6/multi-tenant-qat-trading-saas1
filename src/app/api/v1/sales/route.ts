import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createSale, saleSchema } from "@/lib/services/trading";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const limit = Number(url.searchParams.get("limit") ?? 50);

    const filters = [eq(sales.tenantId, ctx.tenantId)];
    if (since) filters.push(gte(sales.saleDate, new Date(since)));

    return db
      .select({
        id: sales.id,
        invoiceNo: sales.invoiceNo,
        totalAmount: sales.totalAmount,
        paidAmount: sales.paidAmount,
        remainingAmount: sales.remainingAmount,
        paymentStatus: sales.paymentStatus,
        saleDate: sales.saleDate,
        notes: sales.notes,
        customerId: sales.customerId,
        customerName: customers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(customers.id, sales.customerId))
      .where(and(...filters))
      .orderBy(desc(sales.saleDate))
      .limit(Math.min(Math.max(limit, 1), 500));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = saleSchema.parse(await req.json());
    return createSale(ctx, body);
  });
}
