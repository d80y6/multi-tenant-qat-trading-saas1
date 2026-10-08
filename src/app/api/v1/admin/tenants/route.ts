import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, sales, tenants, users } from "@/db/schema";
import { ApiError, hashPassword, requirePlatformAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";
import { logAudit } from "@/lib/services/audit";
import { seedTenantDefaults } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    return db
      .select({
        id: tenants.id,
        businessName: tenants.businessName,
        ownerName: tenants.ownerName,
        phone: tenants.phone,
        city: tenants.city,
        status: tenants.status,
        subscriptionStatus: tenants.subscriptionStatus,
        trialEndsAt: tenants.trialEndsAt,
        createdAt: tenants.createdAt,
        usersCount: sql<number>`(select count(*) from ${users} u where u.tenant_id = ${tenants.id})`,
        customersCount: sql<number>`(select count(*) from ${customers} c where c.tenant_id = ${tenants.id})`,
        salesTotal: sql<string>`(select coalesce(sum(s.total_amount), 0) from ${sales} s where s.tenant_id = ${tenants.id})`,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt));
  });
}

const createSchema = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  phone: z.string().min(6),
  city: z.string().optional().nullable(),
  password: z.string().min(4).default("123456"),
  trialDays: z.coerce.number().min(0).max(365).default(14),
});

export async function POST(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const body = createSchema.parse(await req.json());

    const [exists] = await db.select().from(users).where(eq(users.phone, body.phone)).limit(1);
    if (exists) throw new ApiError("رقم الجوال مسجل مسبقاً", 409);

    const tenant = await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tenants)
        .values({
          businessName: body.businessName,
          ownerName: body.ownerName,
          phone: body.phone,
          city: body.city ?? null,
          subscriptionStatus: "trial",
          trialEndsAt: new Date(Date.now() + body.trialDays * 86400000),
        })
        .returning();

      await tx.insert(users).values({
        tenantId: t.id,
        name: body.ownerName,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
        role: "owner",
      });

      return t;
    });

    await seedTenantDefaults(tenant.id);
    return tenant;
  });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "suspended", "blocked"]).optional(),
  subscriptionStatus: z.enum(["trial", "active", "expired"]).optional(),
  trialEndsAt: z.string().optional().nullable(),
});

export async function PATCH(req: Request) {
  return handle(async () => {
    await requirePlatformAdmin(req);
    const body = patchSchema.parse(await req.json());
    const [row] = await db
      .update(tenants)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.subscriptionStatus ? { subscriptionStatus: body.subscriptionStatus } : {}),
        ...(body.trialEndsAt ? { trialEndsAt: new Date(body.trialEndsAt) } : {}),
      })
      .where(eq(tenants.id, body.id))
      .returning();

    await logAudit({
      tenantId: body.id,
      actorScope: "platform",
      action: "tenant_updated",
      entity: "tenant",
      entityId: body.id,
      details: {
        status: body.status,
        subscriptionStatus: body.subscriptionStatus,
        trialEndsAt: body.trialEndsAt,
      },
    });

    return row;
  });
}
