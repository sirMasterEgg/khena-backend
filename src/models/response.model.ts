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

// Dideklarasikan lebih dulu karena dipakai skema-skema di bawahnya. `const`
// tidak di-hoist, jadi urutan deklarasi di sini penting.
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

export const nullableMediaModel = t.Union([mediaModel, t.Null()]);

export const collectionModel = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  coverImage: nullableMediaModel,
  bannerImage: nullableMediaModel,
  status: t.String(),
  ...auditColumns,
});

/** Item pada list collection berpaginasi (GET /api/collections). */
export const collectionListItemModel = t.Object({
  ...collectionModel.properties,
  totalProducts: t.Number(),
});

/** Produk (varian) yang di-nest di dalam detail collection. */
export const collectionProductModel = t.Object({
  id: t.String(),
  name: t.String(),
  sku: t.String(),
  order: t.Number(),
});

/** Detail satu collection beserta produk-produknya (GET /api/collections/:id). */
export const collectionDetailModel = t.Object({
  ...collectionModel.properties,
  totalProducts: t.Number(),
  products: t.Array(collectionProductModel),
});

/** Agregat collection untuk dashboard (GET /api/collections/stats). */
export const collectionStatsModel = t.Object({
  totalCollections: t.Number(),
  published: t.Number(),
  draft: t.Number(),
  totalProductsInCollections: t.Number(),
});

export const finishModel = t.Object({
  id: t.String(),
  name: t.String(),
  ...auditColumns,
});

export const careInstructionModel = t.Object({
  id: t.String(),
  instruction: t.String(),
  ...auditColumns,
});

/** Ringkasan color yang di-nest di dalam finish (GET /api/finishes). */
export const finishColorModel = t.Object({
  id: t.String(),
  name: t.String(),
  hexCode: t.String(),
  swatchPhoto: nullableMediaModel,
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
  swatchPhoto: nullableMediaModel,
  notes: nullableString,
  finishesId: nullableString,
  finishes: t.Union([finishModel, t.Null()]),
  ...auditColumns,
});

export const folderModel = t.Object({
  id: t.String(),
  name: t.String(),
  parentId: nullableString,
  path: t.String(),
  ...auditColumns,
});

const productCategoryModel = t.Object({
  id: t.String(),
  name: t.String(),
});

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

/** Dimensi (produk / box): ukuran numerik + media gambarnya. */
const dimensionDetailModel = t.Object({
  width: nullableNumber,
  depth: nullableNumber,
  height: nullableNumber,
  weight: nullableNumber,
  media: nullableMediaModel,
});

/** Detail produk lengkap beserta relasinya (GET /api/products/:id). */
export const productDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  baseSku: t.String(),
  description: nullableString,
  materials: nullableString,
  status: nullableString,
  lowStockAlert: nullableNumber,
  category: productCategoryModel,
  productDimension: dimensionDetailModel,
  boxDimension: dimensionDetailModel,
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
      marketplacePrice: nullableNumber,
      visibility: t.String(),
      images: t.Array(mediaModel),
    }),
  ),
});

/** Agregat produk untuk dashboard (GET /api/products/stats). */
export const productStatsModel = t.Object({
  totalProducts: t.Number(),
  totalInventory: t.Number(),
  totalOutOfStock: t.Number(),
  totalPublished: t.Number(),
  totalDraft: t.Number(),
  totalScheduled: t.Number(),
  totalArchived: t.Number(),
});

const nullableDate = t.Union([t.Date(), t.Null()]);

export const customerModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  phone: t.String(),
  totalOrder: t.Number(),
  lifetimeValue: t.Number(),
  lastOrderAt: nullableDate,
  joinedAt: t.Date(),
  internalNotes: nullableString,
  ...auditColumns,
});

/** Item pada list customer berpaginasi (GET /api/customers). */
export const customerListItemModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  phone: t.String(),
  totalOrder: t.Number(),
  lifetimeValue: t.Number(),
  lastOrderAt: nullableDate,
  joinedAt: t.Date(),
  segment: t.String(),
});

/** Detail satu customer (GET /api/customers/:id). */
export const customerDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  phone: t.String(),
  joinedAt: t.Date(),
  internalNotes: nullableString,
  totalOrders: t.Number(),
  lifetimeValue: t.Number(),
  averageOrder: t.Number(),
  segment: t.String(),
});

/** Agregat customer untuk dashboard (GET /api/customers/stats). */
export const customerStatsModel = t.Object({
  totalCustomers: t.Number(),
  vipCustomers: t.Number(),
  newThisMonth: t.Number(),
  avgLifetimeValue: t.Number(),
});

/** Satu supplier utuh (POST /suppliers, PATCH /suppliers/:id). */
export const supplierModel = t.Object({
  id: t.String(),
  name: t.String(),
  contactPerson: nullableString,
  phone: nullableString,
  email: nullableString,
  note: nullableString,
  ...auditColumns,
});

/** Item pada list supplier (GET /suppliers). */
export const supplierListItemModel = t.Object({
  id: t.String(),
  name: t.String(),
  contactPerson: nullableString,
  phone: nullableString,
  email: nullableString,
});

/** Detail satu supplier (GET /suppliers/:id). */
export const supplierDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  contactPerson: nullableString,
  phone: nullableString,
  email: nullableString,
  note: nullableString,
});

/** Satu purchase order utuh (POST, PATCH). */
export const purchaseOrderModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  supplierId: t.String(),
  orderDate: t.String(),
  expectedDeliveryDate: nullableString,
  totalAmount: t.Number(),
  status: t.String(),
  note: nullableString,
  ...auditColumns,
});

/** Item pada list purchase order (GET /purchase-orders). */
export const purchaseOrderListItemModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  supplierName: t.String(),
  orderDate: t.String(),
  totalItems: t.Number(),
  totalAmount: t.Number(),
  status: t.String(),
});

/** Detail satu purchase order beserta itemnya (GET /purchase-orders/:id). */
export const purchaseOrderDetailModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  supplierId: t.String(),
  supplierName: t.String(),
  orderDate: t.String(),
  expectedDeliveryDate: nullableString,
  status: t.String(),
  totalAmount: t.Number(),
  note: nullableString,
  products: t.Array(
    t.Object({
      detailProductId: t.String(),
      sku: t.String(),
      productName: t.String(),
      quantity: t.Number(),
      unitCost: t.Number(),
      subtotal: t.Number(),
    }),
  ),
});

/** Agregat untuk dashboard (GET /purchase-orders/stats). */
export const purchaseOrderStatsModel = t.Object({
  onOrder: t.Number(),
  onOrderValue: t.Number(),
  totalSuppliers: t.Number(),
});
