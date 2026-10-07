import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { qatTypes } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  defaultPrice: z.coerce.number().min(0).optional().default(0),
});

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    return db
      .select()
      .from(qatTypes)
      .where(and(eq(qatTypes.tenantId, ctx.tenantId), eq(qatTypes.isActive, true)))
      .orderBy(qatTypes.name);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = createSchema.parse(await req.json());
    const [row] = await db
      .insert(qatTypes)
      .values({
        tenantId: ctx.tenantId,
        name: body.name,
        description: body.description ?? null,
        defaultPrice: (body.defaultPrice ?? 0).toFixed(2),
      })
      .returning();
    return row;
  });
}
