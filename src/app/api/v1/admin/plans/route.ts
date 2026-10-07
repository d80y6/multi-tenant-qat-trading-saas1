import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.price);
  });
}

const createSchema = z.object({
  name: z.string().min(2),
  price: z.coerce.number().min(0),
  durationDays: z.coerce.number().min(1),
  maxUsers: z.coerce.number().min(1),
  features: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const body = createSchema.parse(await req.json());
    const [row] = await db
      .insert(subscriptionPlans)
      .values({
        name: body.name,
        price: body.price.toFixed(2),
        durationDays: body.durationDays,
        maxUsers: body.maxUsers,
        features: body.features,
      })
      .returning();
    return row;
  });
}

const patchSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export async function PATCH(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const body = patchSchema.parse(await req.json());
    const [row] = await db
      .update(subscriptionPlans)
      .set({ isActive: body.isActive })
      .where(eq(subscriptionPlans.id, body.id))
      .returning();
    return row;
  });
}
