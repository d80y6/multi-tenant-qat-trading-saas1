import { z } from "zod";
import { db } from "@/db";
import { customers, suppliers, syncLogs } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";
import {
  createCollection,
  createPayment,
  createPurchase,
  createSale,
  purchaseSchema,
  saleSchema,
  voucherSchema,
} from "@/lib/services/trading";

export const dynamic = "force-dynamic";

const operationSchema = z.object({
  clientUuid: z.string().min(1),
  entity: z.enum(["sale", "purchase", "collection", "payment", "customer", "supplier"]),
  createdAt: z.string().optional().nullable(),
  payload: z.record(z.unknown()),
});

const bodySchema = z.object({
  deviceId: z.string().optional().nullable(),
  operations: z.array(operationSchema).max(500),
});

type OpResult = {
  clientUuid: string;
  entity: string;
  status: "applied" | "duplicate" | "failed";
  serverId?: string;
  error?: string;
};

/**
 * POST /api/v1/sync/batch
 * Offline-first batch push from the Flutter app. Each operation carries a
 * client generated UUID so replays are idempotent (at-least-once delivery).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = bodySchema.parse(await req.json());
    const results: OpResult[] = [];

    for (const op of body.operations) {
      try {
        if (op.entity === "sale") {
          const input = saleSchema.parse({ ...op.payload, clientUuid: op.clientUuid });
          const res = await createSale(ctx, input);
          results.push({
            clientUuid: op.clientUuid,
            entity: op.entity,
            status: res.duplicated ? "duplicate" : "applied",
            serverId: res.sale.id,
          });
        } else if (op.entity === "purchase") {
          const input = purchaseSchema.parse({ ...op.payload, clientUuid: op.clientUuid });
          const res = await createPurchase(ctx, input);
          results.push({
            clientUuid: op.clientUuid,
            entity: op.entity,
            status: res.duplicated ? "duplicate" : "applied",
            serverId: res.purchase.id,
          });
        } else if (op.entity === "collection" || op.entity === "payment") {
          const input = voucherSchema.parse({ ...op.payload, clientUuid: op.clientUuid });
          const res =
            op.entity === "collection"
              ? await createCollection(ctx, input)
              : await createPayment(ctx, input);
          results.push({
            clientUuid: op.clientUuid,
            entity: op.entity,
            status: res.duplicated ? "duplicate" : "applied",
            serverId: res.transaction.id,
          });
        } else if (op.entity === "customer") {
          const input = z
            .object({ name: z.string().min(1), phone: z.string().optional().nullable() })
            .parse(op.payload);
          const [row] = await db
            .insert(customers)
            .values({ tenantId: ctx.tenantId, name: input.name, phone: input.phone ?? null })
            .returning({ id: customers.id });
          results.push({
            clientUuid: op.clientUuid,
            entity: op.entity,
            status: "applied",
            serverId: row.id,
          });
        } else {
          const input = z
            .object({ name: z.string().min(1), phone: z.string().optional().nullable() })
            .parse(op.payload);
          const [row] = await db
            .insert(suppliers)
            .values({ tenantId: ctx.tenantId, name: input.name, phone: input.phone ?? null })
            .returning({ id: suppliers.id });
          results.push({
            clientUuid: op.clientUuid,
            entity: op.entity,
            status: "applied",
            serverId: row.id,
          });
        }
      } catch (error) {
        results.push({
          clientUuid: op.clientUuid,
          entity: op.entity,
          status: "failed",
          error: error instanceof Error ? error.message : "sync error",
        });
      }
    }

    const applied = results.filter((r) => r.status === "applied").length;
    const duplicate = results.filter((r) => r.status === "duplicate").length;
    const failed = results.filter((r) => r.status === "failed").length;

    await db.insert(syncLogs).values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      deviceId: body.deviceId ?? null,
      pushedCount: body.operations.length,
      appliedCount: applied,
      skippedCount: duplicate,
      failedCount: failed,
    });

    return {
      serverTime: new Date().toISOString(),
      summary: { pushed: body.operations.length, applied, duplicate, failed },
      results,
    };
  });
}
