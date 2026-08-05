ALTER TABLE "sales_order_items" ADD COLUMN "is_packed" boolean;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "delivery_date" date;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "delivery_time_slot" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "delivery_notes" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "tracking_number" varchar(100);