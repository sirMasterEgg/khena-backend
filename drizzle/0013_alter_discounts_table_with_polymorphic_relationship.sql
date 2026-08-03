ALTER TABLE "discounts" ALTER COLUMN "start_date" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "discounts" ALTER COLUMN "end_date" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "usage_limit" bigint;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "applies_to_type" varchar(30) NOT NULL;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "applies_to_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "discount_amount" bigint;--> statement-breakpoint
CREATE INDEX "discounts_applies_to_idx" ON "discounts" USING btree ("applies_to_type","applies_to_id");--> statement-breakpoint
ALTER TABLE "discounts" DROP COLUMN "limit";