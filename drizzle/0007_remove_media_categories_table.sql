ALTER TABLE "media_categories" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "media_categories" CASCADE;--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_media_category_id_media_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "media_category_id";