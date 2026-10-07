import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { customers, financialTransactions, purchases, qatTypes, sales, suppliers } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Delta pull for the offline mobile cache. */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const sinceParam = new URL(req.url).searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : new Date(0);

    const [qat, cust, supp, sl, pu, tx] = await Promise.all([
      db
        .select()
        .from(qatTypes)
        .where(and(eq(qatTypes.tenantId, ctx.tenantId), gte(qatTypes.createdAt, since))),
      db
        .select()
        .from(customers)
        .where(and(eq(customers.tenantId, ctx.tenantId), gte(customers.createdAt, since))),
      db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.tenantId, ctx.tenantId), gte(suppliers.createdAt, since))),
      db.select().from(sales).where(and(eq(sales.tenantId, ctx.tenantId), gte(sales.createdAt, since))),
      db
        .select()
        .from(purchases)
        .where(and(eq(purchases.tenantId, ctx.tenantId), gte(purchases.createdAt, since))),
      db
        .select()
        .from(financialTransactions)
        .where(
          and(
            eq(financialTransactions.tenantId, ctx.tenantId),
            gte(financialTransactions.createdAt, since),
          ),
        ),
    ]);

    return {
      serverTime: new Date().toISOString(),
      qatTypes: qat,
      customers: cust,
      suppliers: supp,
      sales: sl,
      purchases: pu,
      transactions: tx,
    };
  });
}
