CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"cover_image" uuid,
	"banner_image" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255),
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"collection_id" uuid NOT NULL,
	"detail_product_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "colors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"hex_code" varchar(6) NOT NULL,
	"swatch_photo" uuid,
	"notes" text,
	"finishes_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "finishes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255),
	CONSTRAINT "finishes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_key" varchar(255) NOT NULL,
	"file_type" varchar(5) NOT NULL,
	"media_category_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255),
	CONSTRAINT "media_file_name_unique" UNIQUE("file_name"),
	CONSTRAINT "media_file_key_unique" UNIQUE("file_key")
);
--> statement-breakpoint
CREATE TABLE "media_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "detail_product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"detail_product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "detail_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"color_id" uuid NOT NULL,
	"detail_product_sku" varchar(255) NOT NULL,
	"discounted_price" bigint NOT NULL,
	"non_discounted_price" bigint NOT NULL,
	"visibility" varchar(15) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255),
	CONSTRAINT "detail_products_detail_product_sku_unique" UNIQUE("detail_product_sku")
);
--> statement-breakpoint
CREATE TABLE "product_media_showcase" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_sku" varchar(255) NOT NULL,
	"description" text,
	"materials" text,
	"care_instruction" text,
	"product_dimension" text,
	"box_dimension" text,
	"status" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"deleted_by" varchar(255),
	CONSTRAINT "products_base_sku_unique" UNIQUE("base_sku")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_image_media_id_fk" FOREIGN KEY ("cover_image") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_banner_image_media_id_fk" FOREIGN KEY ("banner_image") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_detail_product_id_detail_products_id_fk" FOREIGN KEY ("detail_product_id") REFERENCES "public"."detail_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colors" ADD CONSTRAINT "colors_swatch_photo_media_id_fk" FOREIGN KEY ("swatch_photo") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colors" ADD CONSTRAINT "colors_finishes_id_finishes_id_fk" FOREIGN KEY ("finishes_id") REFERENCES "public"."finishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_media_category_id_media_categories_id_fk" FOREIGN KEY ("media_category_id") REFERENCES "public"."media_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detail_product_images" ADD CONSTRAINT "detail_product_images_detail_product_id_detail_products_id_fk" FOREIGN KEY ("detail_product_id") REFERENCES "public"."detail_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detail_product_images" ADD CONSTRAINT "detail_product_images_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detail_products" ADD CONSTRAINT "detail_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detail_products" ADD CONSTRAINT "detail_products_color_id_colors_id_fk" FOREIGN KEY ("color_id") REFERENCES "public"."colors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media_showcase" ADD CONSTRAINT "product_media_showcase_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media_showcase" ADD CONSTRAINT "product_media_showcase_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;