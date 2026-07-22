ALTER TABLE "administrator_sessions" DROP CONSTRAINT "administrator_sessions_token_hash_unique";--> statement-breakpoint
ALTER TABLE "administrators" DROP CONSTRAINT "administrators_email_unique";--> statement-breakpoint
ALTER TABLE "collections" DROP CONSTRAINT "collections_slug_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_email_unique";--> statement-breakpoint
ALTER TABLE "discounts" DROP CONSTRAINT "discounts_code_unique";--> statement-breakpoint
ALTER TABLE "finishes" DROP CONSTRAINT "finishes_name_unique";--> statement-breakpoint
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_code_unique";--> statement-breakpoint
ALTER TABLE "detail_products" DROP CONSTRAINT "detail_products_detail_product_sku_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_base_sku_unique";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_invoice_number_unique";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_name_unique";--> statement-breakpoint
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_invoice_number_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "administrator_sessions_token_hash_active_unique" ON "administrator_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "administrators_email_active_unique" ON "administrators" USING btree ("email") WHERE "administrators"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "collections_slug_active_unique" ON "collections" USING btree ("slug") WHERE "collections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_active_unique" ON "customers" USING btree ("email") WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_code_active_unique" ON "discounts" USING btree ("code") WHERE "discounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "finishes_name_active_unique" ON "finishes" USING btree ("name") WHERE "finishes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_active_unique" ON "permissions" USING btree ("code") WHERE "permissions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "detail_products_detail_product_sku_active_unique" ON "detail_products" USING btree ("detail_product_sku") WHERE "detail_products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_base_sku_active_unique" ON "products" USING btree ("base_sku") WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_invoice_number_active_unique" ON "purchase_orders" USING btree ("invoice_number") WHERE "purchase_orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_active_unique" ON "roles" USING btree ("name") WHERE "roles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_invoice_number_active_unique" ON "sales_orders" USING btree ("invoice_number") WHERE "sales_orders"."deleted_at" IS NULL;