CREATE TABLE "care_instructions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instruction" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "product_care_instructions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"care_instruction_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "detail_products" ADD COLUMN "price" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "detail_products" ADD COLUMN "discount_percent" integer;--> statement-breakpoint
ALTER TABLE "detail_products" ADD COLUMN "capital_price" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "detail_products" ADD COLUMN "marketplace_price" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_dimension_media_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "box_dimension_media_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_dimension_width" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_dimension_depth" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_dimension_height" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_dimension_weight" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "box_dimension_width" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "box_dimension_depth" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "box_dimension_height" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "box_dimension_weight" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_stock_alert" integer;--> statement-breakpoint
ALTER TABLE "product_care_instructions" ADD CONSTRAINT "product_care_instructions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_care_instructions" ADD CONSTRAINT "product_care_instructions_care_instruction_id_care_instructions_id_fk" FOREIGN KEY ("care_instruction_id") REFERENCES "public"."care_instructions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_dimension_media_id_media_id_fk" FOREIGN KEY ("product_dimension_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_box_dimension_media_id_media_id_fk" FOREIGN KEY ("box_dimension_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detail_products" DROP COLUMN "discounted_price";--> statement-breakpoint
ALTER TABLE "detail_products" DROP COLUMN "non_discounted_price";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "care_instruction";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "product_dimension";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "box_dimension";