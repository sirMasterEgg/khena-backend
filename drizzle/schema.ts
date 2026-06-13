import { pgTable, foreignKey, uuid, varchar, bigint, text, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const media = pgTable("media", {
	id: uuid().primaryKey().notNull(),
	folderId: uuid("folder_id"),
	name: varchar({ length: 255 }).notNull(),
	originalName: varchar("original_name", { length: 255 }),
	type: varchar({ length: 20 }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }),
	extension: varchar({ length: 10 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	storageProvider: varchar("storage_provider", { length: 10 }).notNull(),
	bucket: varchar({ length: 100 }).notNull(),
	objectKey: text("object_key").notNull(),
	width: integer(),
	height: integer(),
	duration: numeric(),
	thumbnailKey: text("thumbnail_key"),
	altText: text("alt_text"),
	metadata: text(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	mediaCategoryId: uuid("media_category_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [folders.id],
			name: "media_folder_id_folders_id_fk"
		}),
	foreignKey({
			columns: [table.mediaCategoryId],
			foreignColumns: [mediaCategories.id],
			name: "media_media_category_id_media_categories_id_fk"
		}),
]);

export const collections = pgTable("collections", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 255 }).notNull(),
	coverImage: uuid("cover_image"),
	bannerImage: uuid("banner_image"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.coverImage],
			foreignColumns: [media.id],
			name: "collections_cover_image_media_id_fk"
		}),
	foreignKey({
			columns: [table.bannerImage],
			foreignColumns: [media.id],
			name: "collections_banner_image_media_id_fk"
		}),
	unique("collections_slug_unique").on(table.slug),
]);

export const productCollections = pgTable("product_collections", {
	id: uuid().primaryKey().notNull(),
	collectionId: uuid("collection_id").notNull(),
	detailProductId: uuid("detail_product_id").notNull(),
	order: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.collectionId],
			foreignColumns: [collections.id],
			name: "product_collections_collection_id_collections_id_fk"
		}),
	foreignKey({
			columns: [table.detailProductId],
			foreignColumns: [detailProducts.id],
			name: "product_collections_detail_product_id_detail_products_id_fk"
		}),
]);

export const detailProducts = pgTable("detail_products", {
	id: uuid().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	colorId: uuid("color_id").notNull(),
	detailProductSku: varchar("detail_product_sku", { length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	discountedPrice: bigint("discounted_price", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nonDiscountedPrice: bigint("non_discounted_price", { mode: "number" }).notNull(),
	visibility: varchar({ length: 15 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "detail_products_product_id_products_id_fk"
		}),
	foreignKey({
			columns: [table.colorId],
			foreignColumns: [colors.id],
			name: "detail_products_color_id_colors_id_fk"
		}),
	unique("detail_products_detail_product_sku_unique").on(table.detailProductSku),
]);

export const colors = pgTable("colors", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	hexCode: varchar("hex_code", { length: 6 }).notNull(),
	swatchPhoto: uuid("swatch_photo"),
	notes: text(),
	finishesId: uuid("finishes_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.swatchPhoto],
			foreignColumns: [media.id],
			name: "colors_swatch_photo_media_id_fk"
		}),
	foreignKey({
			columns: [table.finishesId],
			foreignColumns: [finishes.id],
			name: "colors_finishes_id_finishes_id_fk"
		}),
]);

export const finishes = pgTable("finishes", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	unique("finishes_name_unique").on(table.name),
]);

export const folders = pgTable("folders", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	parentId: uuid("parent_id"),
	path: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "folders_parent_id_folders_id_fk"
		}),
]);

export const mediaCategories = pgTable("media_categories", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
});

export const detailProductImages = pgTable("detail_product_images", {
	id: uuid().primaryKey().notNull(),
	detailProductId: uuid("detail_product_id").notNull(),
	mediaId: uuid("media_id").notNull(),
	order: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.detailProductId],
			foreignColumns: [detailProducts.id],
			name: "detail_product_images_detail_product_id_detail_products_id_fk"
		}),
	foreignKey({
			columns: [table.mediaId],
			foreignColumns: [media.id],
			name: "detail_product_images_media_id_media_id_fk"
		}),
]);

export const products = pgTable("products", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	baseSku: varchar("base_sku", { length: 255 }).notNull(),
	description: text(),
	materials: text(),
	careInstruction: text("care_instruction"),
	productDimension: text("product_dimension"),
	boxDimension: text("box_dimension"),
	status: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	unique("products_base_sku_unique").on(table.baseSku),
]);

export const productMediaShowcase = pgTable("product_media_showcase", {
	id: uuid().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	mediaId: uuid("media_id").notNull(),
	order: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdBy: varchar("created_by", { length: 255 }),
	updatedBy: varchar("updated_by", { length: 255 }),
	deletedBy: varchar("deleted_by", { length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_media_showcase_product_id_products_id_fk"
		}),
	foreignKey({
			columns: [table.mediaId],
			foreignColumns: [media.id],
			name: "product_media_showcase_media_id_media_id_fk"
		}),
]);
