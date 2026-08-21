CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page" varchar(50) NOT NULL,
	"section" varchar(50) NOT NULL,
	"data" jsonb NOT NULL,
	"visibility" varchar(15) NOT NULL,
	"status" varchar(15) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_page_section_unique" ON "pages" USING btree ("page","section");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_user_product_unique" ON "wishlists" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_active_unique" ON "categories" USING btree ("slug") WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_slug_active_unique" ON "jobs" USING btree ("slug") WHERE "jobs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "detail_products_product_id_created_at_idx" ON "detail_products" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "room_types_slug_active_unique" ON "room_types" USING btree ("slug") WHERE "room_types"."deleted_at" IS NULL;