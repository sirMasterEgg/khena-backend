ALTER TABLE "stocks" RENAME COLUMN "product_id" TO "detail_product_id";--> statement-breakpoint
ALTER TABLE "stocks" DROP CONSTRAINT "stocks_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "detail_products" ALTER COLUMN "marketplace_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_detail_product_id_detail_products_id_fk" FOREIGN KEY ("detail_product_id") REFERENCES "public"."detail_products"("id") ON DELETE no action ON UPDATE no action;