import { relations } from "drizzle-orm/relations";
import { folders, media, mediaCategories, collections, productCollections, detailProducts, products, colors, finishes, detailProductImages, productMediaShowcase } from "./schema";

export const mediaRelations = relations(media, ({one, many}) => ({
	folder: one(folders, {
		fields: [media.folderId],
		references: [folders.id]
	}),
	mediaCategory: one(mediaCategories, {
		fields: [media.mediaCategoryId],
		references: [mediaCategories.id]
	}),
	collections_coverImage: many(collections, {
		relationName: "collections_coverImage_media_id"
	}),
	collections_bannerImage: many(collections, {
		relationName: "collections_bannerImage_media_id"
	}),
	colors: many(colors),
	detailProductImages: many(detailProductImages),
	productMediaShowcases: many(productMediaShowcase),
}));

export const foldersRelations = relations(folders, ({one, many}) => ({
	media: many(media),
	folder: one(folders, {
		fields: [folders.parentId],
		references: [folders.id],
		relationName: "folders_parentId_folders_id"
	}),
	folders: many(folders, {
		relationName: "folders_parentId_folders_id"
	}),
}));

export const mediaCategoriesRelations = relations(mediaCategories, ({many}) => ({
	media: many(media),
}));

export const collectionsRelations = relations(collections, ({one, many}) => ({
	media_coverImage: one(media, {
		fields: [collections.coverImage],
		references: [media.id],
		relationName: "collections_coverImage_media_id"
	}),
	media_bannerImage: one(media, {
		fields: [collections.bannerImage],
		references: [media.id],
		relationName: "collections_bannerImage_media_id"
	}),
	productCollections: many(productCollections),
}));

export const productCollectionsRelations = relations(productCollections, ({one}) => ({
	collection: one(collections, {
		fields: [productCollections.collectionId],
		references: [collections.id]
	}),
	detailProduct: one(detailProducts, {
		fields: [productCollections.detailProductId],
		references: [detailProducts.id]
	}),
}));

export const detailProductsRelations = relations(detailProducts, ({one, many}) => ({
	productCollections: many(productCollections),
	product: one(products, {
		fields: [detailProducts.productId],
		references: [products.id]
	}),
	color: one(colors, {
		fields: [detailProducts.colorId],
		references: [colors.id]
	}),
	detailProductImages: many(detailProductImages),
}));

export const productsRelations = relations(products, ({many}) => ({
	detailProducts: many(detailProducts),
	productMediaShowcases: many(productMediaShowcase),
}));

export const colorsRelations = relations(colors, ({one, many}) => ({
	detailProducts: many(detailProducts),
	media: one(media, {
		fields: [colors.swatchPhoto],
		references: [media.id]
	}),
	finish: one(finishes, {
		fields: [colors.finishesId],
		references: [finishes.id]
	}),
}));

export const finishesRelations = relations(finishes, ({many}) => ({
	colors: many(colors),
}));

export const detailProductImagesRelations = relations(detailProductImages, ({one}) => ({
	detailProduct: one(detailProducts, {
		fields: [detailProductImages.detailProductId],
		references: [detailProducts.id]
	}),
	media: one(media, {
		fields: [detailProductImages.mediaId],
		references: [media.id]
	}),
}));

export const productMediaShowcaseRelations = relations(productMediaShowcase, ({one}) => ({
	product: one(products, {
		fields: [productMediaShowcase.productId],
		references: [products.id]
	}),
	media: one(media, {
		fields: [productMediaShowcase.mediaId],
		references: [media.id]
	}),
}));