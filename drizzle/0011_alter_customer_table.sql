ALTER TABLE "customers" ADD COLUMN "total_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lifetime_value" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_order_at" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "internal_notes" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_active_unique" ON "customers" USING btree ("phone") WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "password";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "city";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "province";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "country";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "zip_code";--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN "customer_segment";