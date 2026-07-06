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

export const mediaCategoryModel = t.Object({
  id: t.String(),
  name: t.String(),
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
  width: nullableNumber,
  height: nullableNumber,
  // kolom numeric Postgres dikembalikan sebagai string oleh driver.
  duration: t.Union([t.String(), t.Number(), t.Null()]),
  thumbnailKey: nullableString,
  altText: nullableString,
  metadata: nullableString,
  status: t.String(),
  mediaCategoryId: nullableString,
  ...auditColumns,
});
