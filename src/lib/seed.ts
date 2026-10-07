import { db } from "@/db";
import {
  customers,
  platformAdmins,
  qatTypes,
  subscriptionPlans,
  suppliers,
  tenantSubscriptions,
  tenants,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createPurchase, createSale, createCollection } from "@/lib/services/trading";
import { eq } from "drizzle-orm";

export const DEMO_CREDENTIALS = {
  owner: { phone: "777000111", password: "123456", label: "مالك المنشأة" },
  worker: { phone: "777000222", password: "123456", label: "موظف" },
  admin: { email: "admin@qatsaas.com", password: "admin123", label: "المشرف العام" },
};

export const DEFAULT_QAT_TYPES: { name: string; description: string; price: number }[] = [
  { name: "عرهبي", description: "قات عرهبي درجة أولى", price: 5000 },
  { name: "حمداني", description: "قات حمداني", price: 4000 },
  { name: "عنسي", description: "قات عنسي", price: 3500 },
  { name: "شامي", description: "قات شامي", price: 6000 },
  { name: "صبري", description: "قات صبري", price: 3000 },
  { name: "خولاني", description: "قات خولاني", price: 7000 },
  { name: "جعفري", description: "قات جعفري", price: 2500 },
];

export async function seedTenantDefaults(tenantId: string) {
  const existing = await db
    .select({ id: qatTypes.id })
    .from(qatTypes)
    .where(eq(qatTypes.tenantId, tenantId))
    .limit(1);
  if (existing.length) return;

  await db.insert(qatTypes).values(
    DEFAULT_QAT_TYPES.map((t) => ({
      tenantId,
      name: t.name,
      description: t.description,
      defaultPrice: t.price.toFixed(2),
    })),
  );
}

/**
 * زرع بيانات البداية — idempotent بالكامل:
 * كل خطوة تتحقق من وجود السجل قبل الإنشاء، فيمكن استدعاؤها بأمان أكثر من مرة.
 */
export async function seedInitialData() {
  await seedPlatformAdmin();
  const plans = await seedPlans();
  await seedDemoTenant(plans);
}

async function seedPlatformAdmin() {
  const [existing] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.email, DEMO_CREDENTIALS.admin.email))
    .limit(1);
  if (existing) return;

  await db.insert(platformAdmins).values({
    name: "مدير المنصة",
    email: DEMO_CREDENTIALS.admin.email,
    phone: "777000000",
    passwordHash: await hashPassword(DEMO_CREDENTIALS.admin.password),
    role: "super_admin",
  });
}

async function seedPlans() {
  const existing = await db.select().from(subscriptionPlans);
  if (existing.length) return existing;

  return db
    .insert(subscriptionPlans)
    .values([
      {
        name: "الباقة الأساسية",
        price: "5000.00",
        durationDays: 30,
        maxUsers: 2,
        features: ["إدارة العملاء والموردين", "فواتير بيع وشراء", "سندات قبض وصرف"],
      },
      {
        name: "الباقة الاحترافية",
        price: "12000.00",
        durationDays: 30,
        maxUsers: 6,
        features: ["كل مزايا الأساسية", "حسابات موظفين", "تقارير متقدمة", "مزامنة أوفلاين"],
      },
      {
        name: "الباقة السنوية",
        price: "120000.00",
        durationDays: 365,
        maxUsers: 15,
        features: ["كل المزايا", "دعم فني مخصص", "طباعة بلوتوث", "نسخ احتياطي يومي"],
      },
    ])
    .returning();
}

async function seedDemoTenant(plans: { id: string }[]) {
  const [existingOwner] = await db
    .select()
    .from(users)
    .where(eq(users.phone, DEMO_CREDENTIALS.owner.phone))
    .limit(1);
  if (existingOwner) return;

  const [tenant] = await db
    .insert(tenants)
    .values({
      businessName: "مقوت الريان للقات",
      ownerName: "أحمد الريان",
      phone: DEMO_CREDENTIALS.owner.phone,
      city: "صنعاء",
      status: "active",
      subscriptionStatus: "active",
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
    })
    .returning();

  if (plans[1]) {
    await db.insert(tenantSubscriptions).values({
      tenantId: tenant.id,
      planId: plans[1].id,
      endDate: new Date(Date.now() + 30 * 86400000),
      status: "active",
      autoRenew: true,
    });
  }

  const inserted = await db
    .insert(users)
    .values([
      {
        tenantId: tenant.id,
        name: "أحمد الريان",
        phone: DEMO_CREDENTIALS.owner.phone,
        passwordHash: await hashPassword(DEMO_CREDENTIALS.owner.password),
        role: "owner",
      },
      {
        tenantId: tenant.id,
        name: "سالم العامل",
        phone: DEMO_CREDENTIALS.worker.phone,
        passwordHash: await hashPassword(DEMO_CREDENTIALS.worker.password),
        role: "worker",
      },
    ])
    .returning();

  const owner = inserted[0];
  await seedTenantDefaults(tenant.id);
  const types = await db.select().from(qatTypes).where(eq(qatTypes.tenantId, tenant.id));

  const supplierRows = await db
    .insert(suppliers)
    .values([
      { tenantId: tenant.id, name: "مزارع بني مطر", phone: "771111111", address: "بني مطر" },
      { tenantId: tenant.id, name: "سوق حمدان", phone: "772222222", address: "حمدان" },
      { tenantId: tenant.id, name: "مزرعة خولان", phone: "773333333", address: "خولان" },
    ])
    .returning();

  const customerRows = await db
    .insert(customers)
    .values([
      { tenantId: tenant.id, name: "محمد الحاشدي", phone: "770000001" },
      { tenantId: tenant.id, name: "عبدالله الصلوي", phone: "770000002" },
      { tenantId: tenant.id, name: "فهد المقطري", phone: "770000003" },
      { tenantId: tenant.id, name: "زبون نقدي", phone: null },
    ])
    .returning();

  const ctx = { userId: owner.id, tenantId: tenant.id, role: "owner" as const, name: owner.name };
  const byName = (name: string) => types.find((t) => t.name === name) ?? types[0];

  await createPurchase(ctx, {
    supplierId: supplierRows[0].id,
    items: [
      { qatTypeId: byName("عرهبي").id, qatTypeName: "عرهبي", quantity: 20, unitPrice: 4200 },
      { qatTypeId: byName("حمداني").id, qatTypeName: "حمداني", quantity: 15, unitPrice: 3200 },
    ],
    paidAmount: 60000,
    notes: "شراء صباح اليوم",
  });

  await createPurchase(ctx, {
    supplierId: supplierRows[2].id,
    items: [{ qatTypeId: byName("خولاني").id, qatTypeName: "خولاني", quantity: 10, unitPrice: 6200 }],
    paidAmount: 0,
  });

  await createSale(ctx, {
    customerId: customerRows[0].id,
    items: [{ qatTypeId: byName("عرهبي").id, qatTypeName: "عرهبي", quantity: 3, unitPrice: 5000 }],
    paidAmount: 5000,
    notes: "بيع جزئي",
  });

  await createSale(ctx, {
    customerId: customerRows[1].id,
    items: [{ qatTypeId: byName("شامي").id, qatTypeName: "شامي", quantity: 2, unitPrice: 6000 }],
    paidAmount: 0,
  });

  await createSale(ctx, {
    customerId: customerRows[3].id,
    items: [{ qatTypeId: byName("عنسي").id, qatTypeName: "عنسي", quantity: 4, unitPrice: 3500 }],
    paidAmount: 14000,
  });

  await createCollection(ctx, {
    partyId: customerRows[0].id,
    amount: 3000,
    notes: "دفعة من الدين",
  });
}
