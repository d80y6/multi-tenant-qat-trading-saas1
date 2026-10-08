ALTER TABLE "subscription_payments" ALTER COLUMN "paid_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_payments" ALTER COLUMN "paid_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "provider_payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");