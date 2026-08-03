ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "detail_product_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "created_via" varchar(15) DEFAULT 'order_sales' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_detail_product_id_detail_products_id_fk" FOREIGN KEY ("detail_product_id") REFERENCES "public"."detail_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" DROP COLUMN "product_id";