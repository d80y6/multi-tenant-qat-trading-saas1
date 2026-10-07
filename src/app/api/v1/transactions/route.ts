import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { customers, financialTransactions, suppliers, users } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** دفتر الأستاذ العام للمنشأة مع فلترة بالنوع والفترة. */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limit = Number(url.searchParams.get("limit") ?? 100);

    const filters = [eq(financialTransactions.tenantId, ctx.tenantId)];
    if (type) filters.push(eq(financialTransactions.transactionType, type));
    if (from) filters.push(gte(financialTransactions.transactionDate, new Date(from)));
    if (to) filters.push(lte(financialTransactions.transactionDate, new Date(to)));

    return db
      .select({
        id: financialTransactions.id,
        partyType: financialTransactions.partyType,
        partyId: financialTransactions.partyId,
        transactionType: financialTransactions.transactionType,
        amount: financialTransactions.amount,
        referenceId: financialTransactions.referenceId,
        transactionDate: financialTransactions.transactionDate,
        notes: financialTransactions.notes,
        userName: users.name,
        customerName: customers.name,
        supplierName: suppliers.name,
      })
      .from(financialTransactions)
      .leftJoin(users, eq(users.id, financialTransactions.userId))
      .leftJoin(customers, eq(customers.id, financialTransactions.partyId))
      .leftJoin(suppliers, eq(suppliers.id, financialTransactions.partyId))
      .where(and(...filters))
      .orderBy(desc(financialTransactions.transactionDate))
      .limit(Math.min(Math.max(limit, 1), 500));
  });
}
