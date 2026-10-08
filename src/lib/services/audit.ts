import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditEntry = {
  tenantId?: string | null;
  userId?: string | null;
  actorScope?: "tenant" | "platform";
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
};

export function auditRow(entry: AuditEntry) {
  return {
    tenantId: entry.tenantId ?? null,
    userId: entry.userId ?? null,
    actorScope: entry.actorScope ?? "tenant",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
  };
}

/**
 * تسجيل إجراء حسّاس. لا يرمي أبداً — فشل التسجيل لا يجب أن يُفشل العملية التجارية.
 * للاستخدام داخل معاملة استخدم `tx.insert(auditLogs).values(auditRow({...}))`.
 */
export async function logAudit(entry: AuditEntry) {
  try {
    await db.insert(auditLogs).values(auditRow(entry));
  } catch (error) {
    console.error("[audit] failed to log", entry.action, error);
  }
}
