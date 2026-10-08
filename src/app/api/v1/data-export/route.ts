import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  customers,
  financialTransactions,
  purchaseItems,
  purchases,
  qatTypes,
  saleItems,
  sales,
  suppliers,
  syncLogs,
  users,
} from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

/**
 * تصدير كامل بيانات المنشأة (JSON) — لحقوق التاجر في نقل بياناته/الامتثال التنظيمي.
 * النطاق مقيّد بـ tenant_id الخاص بالمُطلِب حصراً.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);

    const [
      qat,
      cust,
      supp,
      sl,
      slItems,
      pu,
      puItems,
      ledger,
      staff,
      audits,
      syncs,
    ] = await Promise.all([
      db.select().from(qatTypes).where(eq(qatTypes.tenantId, ctx.tenantId)),
      db.select().from(customers).where(eq(customers.tenantId, ctx.tenantId)),
      db.select().from(suppliers).where(eq(suppliers.tenantId, ctx.tenantId)),
      db.select().from(sales).where(eq(sales.tenantId, ctx.tenantId)),
      db.select().from(saleItems).where(eq(saleItems.tenantId, ctx.tenantId)),
      db.select().from(purchases).where(eq(purchases.tenantId, ctx.tenantId)),
      db.select().from(purchaseItems).where(eq(purchaseItems.tenantId, ctx.tenantId)),
      db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.tenantId, ctx.tenantId)),
      db
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.tenantId, ctx.tenantId)),
      db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, ctx.tenantId))),
      db.select().from(syncLogs).where(eq(syncLogs.tenantId, ctx.tenantId)),
    ]);

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "data_exported",
      entity: "tenant",
      entityId: ctx.tenantId,
      details: {
        counts: {
          sales: sl.length,
          purchases: pu.length,
          customers: cust.length,
          suppliers: supp.length,
          ledger: ledger.length,
        },
      },
    });

    return {
      exportedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      counts: {
        qatTypes: qat.length,
        customers: cust.length,
        suppliers: supp.length,
        sales: sl.length,
        saleItems: slItems.length,
        purchases: pu.length,
        purchaseItems: puItems.length,
        ledger: ledger.length,
        staff: staff.length,
        audits: audits.length,
        syncs: syncs.length,
      },
      data: {
        qatTypes: qat,
        customers: cust,
        suppliers: supp,
        sales: sl,
        saleItems: slItems,
        purchases: pu,
        purchaseItems: puItems,
        ledger,
        staff,
        audits,
        syncs,
      },
    };
  });
}
