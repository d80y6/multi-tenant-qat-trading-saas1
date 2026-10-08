import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/* ------------------------------------------------------------------ */
/* PLATFORM (Super Admin) LAYER                                        */
/* ------------------------------------------------------------------ */

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("super_admin"), // super_admin | support
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  price: money("price").notNull().default("0"),
  durationDays: integer("duration_days").notNull().default(30),
  maxUsers: integer("max_users").notNull().default(3),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone").notNull().unique(),
  city: text("city"),
  status: text("status").notNull().default("active"), // active | suspended | blocked
  subscriptionStatus: text("subscription_status").notNull().default("trial"), // trial | active | expired
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"), // active | expired | cancelled
    autoRenew: boolean("auto_renew").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_subscriptions_tenant_idx").on(t.tenantId)],
);

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantSubscriptionId: uuid("tenant_subscription_id")
      .notNull()
      .references(() => tenantSubscriptions.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    amount: money("amount").notNull().default("0"),
    paymentMethod: text("payment_method").notNull().default("cash"), // cash | bank | wallet | card
    transactionReference: text("transaction_reference"),
    status: text("status").notNull().default("paid"), // paid | pending | failed | refunded
    provider: text("provider").notNull().default("manual"), // manual | stripe
    checkoutUrl: text("checkout_url"),
    providerPayload: jsonb("provider_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscription_payments_tenant_idx").on(t.tenantId),
    index("subscription_payments_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* TENANT BUSINESS LAYER                                               */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("worker"), // owner | manager | worker
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_phone_unique").on(t.phone)],
);

export const qatTypes = pgTable(
  "qat_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    defaultPrice: money("default_price").notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qat_types_tenant_idx").on(t.tenantId)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    // balance > 0 => merchant owes the supplier
    balance: money("balance").notNull().default("0"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    clientUuid: text("client_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_tenant_idx").on(t.tenantId),
    uniqueIndex("suppliers_client_uuid_unique").on(t.tenantId, t.clientUuid),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    // balance > 0 => customer owes the merchant
    balance: money("balance").notNull().default("0"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    clientUuid: text("client_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customers_tenant_idx").on(t.tenantId),
    uniqueIndex("customers_client_uuid_unique").on(t.tenantId, t.clientUuid),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    invoiceNo: integer("invoice_no").notNull().default(0),
    totalAmount: money("total_amount").notNull().default("0"),
    paidAmount: money("paid_amount").notNull().default("0"),
    remainingAmount: money("remaining_amount").notNull().default("0"),
    paymentStatus: text("payment_status").notNull().default("cash"), // cash | credit | partial
    notes: text("notes"),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull().defaultNow(),
    clientUuid: text("client_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("purchases_tenant_idx").on(t.tenantId),
    uniqueIndex("purchases_client_uuid_unique").on(t.tenantId, t.clientUuid),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    qatTypeId: uuid("qat_type_id").references(() => qatTypes.id, { onDelete: "set null" }),
    qatTypeName: text("qat_type_name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: money("unit_price").notNull().default("0"),
    subtotal: money("subtotal").notNull().default("0"),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId)],
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    invoiceNo: integer("invoice_no").notNull().default(0),
    totalAmount: money("total_amount").notNull().default("0"),
    paidAmount: money("paid_amount").notNull().default("0"),
    remainingAmount: money("remaining_amount").notNull().default("0"),
    paymentStatus: text("payment_status").notNull().default("cash"), // cash | credit | partial
    notes: text("notes"),
    saleDate: timestamp("sale_date", { withTimezone: true }).notNull().defaultNow(),
    clientUuid: text("client_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sales_tenant_idx").on(t.tenantId),
    uniqueIndex("sales_client_uuid_unique").on(t.tenantId, t.clientUuid),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    qatTypeId: uuid("qat_type_id").references(() => qatTypes.id, { onDelete: "set null" }),
    qatTypeName: text("qat_type_name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: money("unit_price").notNull().default("0"),
    subtotal: money("subtotal").notNull().default("0"),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

export const financialTransactions = pgTable(
  "financial_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    partyType: text("party_type").notNull(), // customer | supplier
    partyId: uuid("party_id"),
    // sale | purchase | collection (سند قبض) | payment (سند صرف) | adjustment
    transactionType: text("transaction_type").notNull(),
    amount: money("amount").notNull().default("0"),
    referenceId: uuid("reference_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    clientUuid: text("client_uuid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("financial_transactions_tenant_idx").on(t.tenantId),
    index("financial_transactions_party_idx").on(t.tenantId, t.partyType, t.partyId),
    uniqueIndex("financial_transactions_client_uuid_unique").on(t.tenantId, t.clientUuid),
  ],
);

/** سجل التدقيق: كل إجراء حسّاس (إلغاء فاتورة، تغيير صلاحيات، تفعيل اشتراك). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    actorScope: text("actor_scope").notNull().default("tenant"), // tenant | platform
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_tenant_idx").on(t.tenantId),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
  ],
);

export const syncLogs = pgTable(
  "sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    deviceId: text("device_id"),
    pushedCount: integer("pushed_count").notNull().default(0),
    appliedCount: integer("applied_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sync_logs_tenant_idx").on(t.tenantId)],
);
