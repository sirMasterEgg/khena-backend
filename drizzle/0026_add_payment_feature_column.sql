ALTER TABLE "sales_orders" ADD COLUMN "buyer_email" varchar(255);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "buyer_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "payment_status" varchar(15);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "payment_token" varchar(255);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "payment_redirect_url" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "payment_type" varchar(30);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "paid_at" timestamp;