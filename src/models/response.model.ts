import { t } from "elysia";
import { auditColumns } from "./api-schema";

/**
 * Skema response per-entitas. Dipakai controller untuk memvalidasi `response`.
 * Bentuknya mengikuti kolom DB (lihat models/*.model.ts) + kolom audit.
 * Ingat: skema response bersifat whitelist — field yang tidak tercantum akan
 * dihilangkan dari body, jadi pastikan semua kolom yang ingin dikirim ada di sini.
 */

const nullableString = t.Union([t.String(), t.Null()]);
const nullableNumber = t.Union([t.Number(), t.Null()]);

export const roomTypeModel = t.Object({
  id: t.String(),
  roomType: t.String(),
  ...auditColumns,
});

export const categoryModel = t.Object({
  id: t.String(),
  category: t.String(),
  order: t.Number(),
  roomTypeId: t.String(),
  status: t.String(),
  ...auditColumns,
});

/** Detail satu kategori beserta room type-nya (GET /api/categories/:id). */
export const categoryDetailModel = t.Object({
  id: t.String(),
  category: t.String(),
  order: t.Number(),
  status: t.String(),
  roomType: t.Object({ id: t.String(), roomType: t.String() }),
  ...auditColumns,
});

/** Agregat kategori untuk dashboard (GET /api/categories/stats). */
export const categoryStatsModel = t.Object({
  totalCategories: t.Number(),
  publishedCategories: t.Number(),
  draftCategories: t.Number(),
  roomGroups: t.Number(),
});

export const collectionModel = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  coverImage: nullableString,
  bannerImage: nullableString,
  status: t.String(),
  ...auditColumns,
});

export const finishModel = t.Object({
  id: t.String(),
  name: t.String(),
  ...auditColumns,
});

/** Ringkasan color yang di-nest di dalam finish (GET /api/finishes). */
export const finishColorModel = t.Object({
  id: t.String(),
  name: t.String(),
  hexCode: t.String(),
  swatchPhoto: nullableString,
  notes: nullableString,
});

/** Finish beserta color miliknya (GET /api/finishes). */
export const finishWithColorsModel = t.Object({
  id: t.String(),
  name: t.String(),
  colors: t.Array(finishColorModel),
  ...auditColumns,
});

export const colorModel = t.Object({
  id: t.String(),
  name: t.String(),
  hexCode: t.String(),
  swatchPhoto: nullableString,
  notes: nullableString,
  finishesId: nullableString,
  ...auditColumns,
});

export const folderModel = t.Object({
  id: t.String(),
  name: t.String(),
  parentId: nullableString,
  path: t.String(),
  ...auditColumns,
});

export const mediaModel = t.Object({
  id: t.String(),
  folderId: nullableString,
  name: t.String(),
  originalName: nullableString,
  type: t.String(),
  mimeType: nullableString,
  extension: nullableString,
  sizeBytes: t.Number(),
  storageProvider: t.String(),
  bucket: t.String(),
  objectKey: t.String(),
  url: t.String(),
  width: nullableNumber,
  height: nullableNumber,
  // kolom numeric Postgres dikembalikan sebagai string oleh driver.
  duration: t.Union([t.String(), t.Number(), t.Null()]),
  thumbnailKey: nullableString,
  altText: nullableString,
  metadata: nullableString,
  status: t.String(),
  ...auditColumns,
});

const productCategoryModel = t.Object({
  id: t.String(),
  name: t.String(),
});

const nullableMediaModel = t.Union([mediaModel, t.Null()]);

/** Item pada list produk berpaginasi (GET /api/products). */
export const productListItemModel = t.Object({
  id: t.String(),
  name: t.String(),
  baseSku: t.String(),
  status: nullableString,
  description: nullableString,
  category: productCategoryModel,
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

/** Detail produk lengkap beserta relasinya (GET /api/products/:id). */
export const productDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  baseSku: t.String(),
  description: nullableString,
  materials: nullableString,
  status: nullableString,
  category: productCategoryModel,
  productDimensionMedia: nullableMediaModel,
  boxDimensionMedia: nullableMediaModel,
  careInstructions: t.Array(
    t.Object({ id: t.String(), instruction: t.String() }),
  ),
  media: t.Array(mediaModel),
  variants: t.Array(
    t.Object({
      id: t.String(),
      colorId: t.String(),
      detailProductSku: t.String(),
      price: t.Number(),
      discountPercent: nullableNumber,
      capitalPrice: t.Number(),
      marketplacePrice: t.Number(),
      visibility: t.String(),
      images: t.Array(mediaModel),
    }),
  ),
});
