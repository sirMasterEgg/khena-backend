-- Rename and change type for product_dimension
ALTER TABLE "products" RENAME COLUMN "product_dimension" TO "product_dimension_media_id";
ALTER TABLE "products" ALTER COLUMN "product_dimension_media_id" SET DATA TYPE uuid USING NULL::uuid;
ALTER TABLE "products" ADD CONSTRAINT "products_product_dimension_media_id_media_id_fk" FOREIGN KEY ("product_dimension_media_id") REFERENCES "media"("id") ON DELETE no action ON UPDATE no action;

-- Rename and change type for box_dimension
ALTER TABLE "products" RENAME COLUMN "box_dimension" TO "box_dimension_media_id";
ALTER TABLE "products" ALTER COLUMN "box_dimension_media_id" SET DATA TYPE uuid USING NULL::uuid;
ALTER TABLE "products" ADD CONSTRAINT "products_box_dimension_media_id_media_id_fk" FOREIGN KEY ("box_dimension_media_id") REFERENCES "media"("id") ON DELETE no action ON UPDATE no action;
