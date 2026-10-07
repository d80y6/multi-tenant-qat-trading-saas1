import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
});

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const creditorsOnly = url.searchParams.get("creditors") === "1";

    const filters = [eq(suppliers.tenantId, ctx.tenantId)];
    if (q) {
      const like = `%${q}%`;
      const match = or(ilike(suppliers.name, like), ilike(suppliers.phone, like));
      if (match) filters.push(match);
    }
    if (creditorsOnly) filters.push(sql`${suppliers.balance} > 0`);

    return db
      .select()
      .from(suppliers)
      .where(and(...filters))
      .orderBy(desc(suppliers.balance), suppliers.name)
      .limit(300);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = createSchema.parse(await req.json());
    const [row] = await db
      .insert(suppliers)
      .values({
        tenantId: ctx.tenantId,
        name: body.name,
        phone: body.phone ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
        balance: (body.openingBalance ?? 0).toFixed(2),
      })
      .returning();
    return row;
  });
}
