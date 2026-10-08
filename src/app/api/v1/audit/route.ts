import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** سجل التدقيق الخاص بالمنشأة — الإجراءات الحساسة مع مرتكبها ووقتها. */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const entity = url.searchParams.get("entity");
    const action = url.searchParams.get("action");
    const limit = Number(url.searchParams.get("limit") ?? 100);

    const filters = [eq(auditLogs.tenantId, ctx.tenantId)];
    if (entity) filters.push(eq(auditLogs.entity, entity));
    if (action) filters.push(eq(auditLogs.action, action));

    return db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        userName: users.name,
        actorScope: auditLogs.actorScope,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(and(...filters))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
  });
}
