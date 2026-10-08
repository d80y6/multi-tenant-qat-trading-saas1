import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  customers,
  qatTypes,
  suppliers,
  tenants,
  users,
} from "../src/db/schema";
import { hashPassword, type TenantContext } from "../src/lib/auth";
import {
  createCollection,
  createPayment,
  createPurchase,
  createSale,
} from "../src/lib/services/trading";
import { voidSale } from "../src/lib/services/invoices";
import { getStatement } from "../src/lib/services/statements";
import { ensureDatabaseReady } from "../src/lib/bootstrap";
import { paymentStatusFor } from "../src/lib/services/trading";

const suffix = Math.random().toString(36).slice(2, 8);
const ownerPhone = `77000${suffix}`.slice(0, 9);

let ctx: TenantContext;
let ctx2: TenantContext;
let customerId: string;
let supplierId: string;
let qatTypeId: string;

const item = (quantity: number, unitPrice: number) => ({
  qatTypeId,
  qatTypeName: "عرهبي",
  quantity,
  unitPrice,
});

beforeAll(async () => {
  await ensureDatabaseReady();

  const [tenant] = await db
    .insert(tenants)
    .values({
      businessName: `منشأة اختبار ${suffix}`,
      ownerName: "اختبار",
      phone: ownerPhone,
      subscriptionStatus: "active",
    })
    .returning();

  const [owner] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      name: "مالك الاختبار",
      phone: ownerPhone,
      passwordHash: await hashPassword("test1234"),
      role: "owner",
    })
    .returning();

  ctx = { userId: owner.id, tenantId: tenant.id, role: "owner", name: owner.name };

  const [type] = await db
    .insert(qatTypes)
    .values({ tenantId: tenant.id, name: "عرهبي", defaultPrice: "5000.00" })
    .returning();
  qatTypeId = type.id;

  const [customer] = await db
    .insert(customers)
    .values({ tenantId: tenant.id, name: "عميل اختبار", phone: "771111111" })
    .returning();
  customerId = customer.id;

  const [supplier] = await db
    .insert(suppliers)
    .values({ tenantId: tenant.id, name: "مورد اختبار", phone: "772222222" })
    .returning();
  supplierId = supplier.id;

  // مستأجر ثانٍ للتحقق من العزل
  const [tenant2] = await db
    .insert(tenants)
    .values({ businessName: `منشأة ثانية ${suffix}`, ownerName: "اختبار", phone: `${ownerPhone}2` })
    .returning();
  const [owner2] = await db
    .insert(users)
    .values({
      tenantId: tenant2.id,
      name: "مالك ثانٍ",
      phone: `${ownerPhone}2`,
      passwordHash: await hashPassword("test1234"),
      role: "owner",
    })
    .returning();
  ctx2 = { userId: owner2.id, tenantId: tenant2.id, role: "owner", name: owner2.name };
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.phone, `${ownerPhone}2`));
  await db.delete(tenants).where(eq(tenants.phone, ownerPhone));
});

async function balance(table: "customer" | "supplier", id: string) {
  const row =
    table === "customer"
      ? (
          await db.select().from(customers).where(eq(customers.id, id)).limit(1)
        )[0]
      : (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
  return Number(row?.balance ?? 0);
}

describe("الفواتير والأرصدة (ACID)", () => {
  it("البيع الآجل يرفع رصيد العميل", async () => {
    await createSale(ctx, {
      customerId,
      items: [item(2, 5000)],
      paidAmount: 0,
    });
    expect(await balance("customer", customerId)).toBe(10000);
  });

  it("البيع النقدي لا يغيّر الرصيد", async () => {
    const before = await balance("customer", customerId);
    await createSale(ctx, { customerId, items: [item(1, 5000)], paidAmount: 5000 });
    expect(await balance("customer", customerId)).toBe(before);
  });

  it("الدفع الجزئي يضيف المتبقي فقط", async () => {
    const before = await balance("customer", customerId);
    await createSale(ctx, { customerId, items: [item(1, 4000)], paidAmount: 1500 });
    expect(await balance("customer", customerId)).toBe(before + 2500);
  });

  it("البيع الآجل بدون عميل يُرفض", async () => {
    await expect(createSale(ctx, { items: [item(1, 1000)], paidAmount: 0 })).rejects.toThrow();
  });

  it("سند القبض يخفض رصيد العميل", async () => {
    const before = await balance("customer", customerId);
    await createCollection(ctx, { partyId: customerId, amount: 3000 });
    expect(await balance("customer", customerId)).toBe(before - 3000);
  });

  it("الشراء الآجل يرفع رصيد المورد والصرف يخفضه", async () => {
    await createPurchase(ctx, { supplierId, items: [item(3, 2000)], paidAmount: 0 });
    expect(await balance("supplier", supplierId)).toBe(6000);
    await createPayment(ctx, { partyId: supplierId, amount: 2000 });
    expect(await balance("supplier", supplierId)).toBe(4000);
  });

  it("إلغاء الفاتورة يعكس الأثر على الرصيد", async () => {
    const before = await balance("customer", customerId);
    const { sale } = await createSale(ctx, {
      customerId,
      items: [item(1, 7000)],
      paidAmount: 0,
    });
    expect(await balance("customer", customerId)).toBe(before + 7000);

    await voidSale(ctx, sale.id);
    expect(await balance("customer", customerId)).toBe(before);
  });

  it("إعادة إرسال العملية نفسها لا تُكرّر القيد (idempotency)", async () => {
    const before = await balance("customer", customerId);
    const payload = {
      customerId,
      items: [item(1, 2500)],
      paidAmount: 0,
      clientUuid: `op-${suffix}`,
    };
    const first = await createSale(ctx, payload);
    const second = await createSale(ctx, payload);

    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);
    expect(await balance("customer", customerId)).toBe(before + 2500);
  });

  it("كشف الحساب يبني الرصيد التراكمي بنفس رصيد العميل", async () => {
    const statement = await getStatement(ctx, "customer", customerId);
    const last = statement.lines.at(-1);
    expect(last).toBeDefined();
    expect(last!.balance).toBeCloseTo(await balance("customer", customerId), 2);
  });
});

describe("عزل المستأجرين", () => {
  it("حسابات مستأجر لا تظهر لمستأجر آخر", async () => {
    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, ctx2.tenantId), eq(customers.id, customerId)));
    expect(rows).toHaveLength(0);
  });

  it("استعلام على طرف بـ tenant_id خاطئ يرمي خطأ", async () => {
    await expect(getStatement(ctx2, "customer", customerId)).rejects.toThrow();
  });
});

describe("تصنيف حالة الدفع", () => {
  it("يصنّف الدفعات بدقة حتى مع أرقام عشرية", () => {
    expect(paymentStatusFor(100, 100)).toBe("cash");
    expect(paymentStatusFor(100, 99.99)).toBe("partial");
    expect(paymentStatusFor(100, 0)).toBe("credit");
  });
});
