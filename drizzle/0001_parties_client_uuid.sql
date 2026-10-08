ALTER TABLE "customers" ADD COLUMN "client_uuid" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "client_uuid" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_client_uuid_unique" ON "customers" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_client_uuid_unique" ON "suppliers" USING btree ("tenant_id","client_uuid");