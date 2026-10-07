import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
  clientUuid: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const debtorsOnly = url.searchParams.get("debtors") === "1";

    const filters = [eq(customers.tenantId, ctx.tenantId)];
    if (q) {
      const like = `%${q}%`;
      const match = or(ilike(customers.name, like), ilike(customers.phone, like));
      if (match) filters.push(match);
    }
    if (debtorsOnly) filters.push(sql`${customers.balance} > 0`);

    const rows = await db
      .select()
      .from(customers)
      .where(and(...filters))
      .orderBy(desc(customers.balance), customers.name)
      .limit(300);

    return rows;
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireTenant(req);
    const body = createSchema.parse(await req.json());
    const [row] = await db
      .insert(customers)
      .values({
        tenantId: ctx.tenantId,
        name: body.name,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        balance: (body.openingBalance ?? 0).toFixed(2),
      })
      .returning();
    return row;
  });
}
