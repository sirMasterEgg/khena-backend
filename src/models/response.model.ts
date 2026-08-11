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

/** Satu kode diskon utuh (POST, PATCH, GET /discounts/:id). */
export const discountModel = t.Object({
  id: t.String(),
  code: t.String(),
  discountType: t.String(),
  discountValue: t.Number(),
  // Sasaran polymorphic. appliesToId null untuk tipe scope.
  appliesToType: t.String(),
  appliesToId: nullableString,
  // Hasil lookup ke tabel tujuan. null jika tipe scope, ATAU jika target
  // sudah di-soft-delete setelah diskon dibuat (target menggantung).
  targetName: nullableString,
  startDate: t.Date(),
  endDate: t.Date(),
  usageLimit: nullableNumber, // null = unlimited
  used: t.Number(),
  status: t.String(), // inactive | scheduled | expired | active
  ...auditColumns,
});

/** Item pada list kode diskon (GET /discounts). */
export const discountListItemModel = t.Object({
  id: t.String(),
  code: t.String(),
  discountType: t.String(),
  discountValue: t.Number(),
  appliesToType: t.String(),
  appliesToId: nullableString, // targetName sengaja tidak ada, lihat bagian 6.3
  startDate: t.Date(),
  endDate: t.Date(),
  used: t.Number(),
  usageLimit: nullableNumber,
  status: t.String(),
});

/** Agregat untuk dashboard (GET /discounts/stats). */
export const discountStatsModel = t.Object({
  totalActiveDiscounts: t.Number(),
  totalRedemptions: t.Number(),
  totalRevenueImpact: t.Number(),
  totalExpiringSoon: t.Number(),
  // Sebaran status turunan (bagian 3.1) di antara baris aktif.
  statusCounts: t.Object({
    all: t.Number(),
    active: t.Number(),
    scheduled: t.Number(),
    expired: t.Number(),
    inactive: t.Number(),
  }),
});

/** Satu varian untuk layar kasir (GET /api/point-of-sales/product-variants). */
export const posProductVariantModel = t.Object({
  detailProductId: t.String(),
  variantName: t.String(),
  sku: t.String(),
  price: t.Number(),
  stock: t.Number(),
  imageUrl: nullableString,
});

/** Hasil satu transaksi kasir (POST /api/point-of-sales). */
export const posTransactionModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  orderDate: t.String(),
  customerId: nullableString,
  paymentMethod: t.String(),
  cashierName: nullableString,
  status: t.String(),
  createdVia: t.String(),
  totalAmount: t.Number(),
  total: t.Number(),
  items: t.Array(
    t.Object({
      detailProductId: t.String(),
      sku: t.String(),
      productName: t.String(),
      quantity: t.Number(),
      unitPrice: t.Number(),
      subtotal: t.Number(),
    }),
  ),
});

/** Satu varian untuk layar input order sales (GET /api/order-sales/product-variants). */
export const orderSalesProductVariantModel = t.Object({
  detailProductId: t.String(),
  variantName: t.String(),
  sku: t.String(),
  price: t.Number(),
  stock: t.Number(),
  imageUrl: nullableString,
});

/** Hasil hitung ongkir (GET /api/order-sales/shipping-cost). */
export const shippingCostModel = t.Object({
  shippingCost: t.Number(),
});

/** Agregat stok untuk dashboard (GET /api/stocks/stats). */
export const stockStatsModel = t.Object({
  totalInventory: t.Number(),
  totalOutOfStock: t.Number(),
  totalRunningLow: t.Number(),
  totalUpdatesToday: t.Number(),
});

/** Satu baris riwayat perubahan stok (GET /api/stocks/adjustments/activity). */
export const stockActivityItemModel = t.Object({
  id: t.String(),
  source: t.Union([t.Literal("ADJUSTMENT"), t.Literal("SYSTEM")]),
  sku: t.String(),
  productName: t.String(),
  quantity: t.Number(), // signed: +10 / -3
  reason: nullableString,
  by: nullableString,
  timestamp: t.Date(),
});

/** Hasil satu baris adjustment (POST /api/stocks/adjustments). */
export const stockAdjustmentResultModel = t.Object({
  id: t.String(),
  sku: t.String(),
  adjustmentType: t.Union([t.Literal("increase"), t.Literal("decrease")]),
  quantity: t.Number(), // qty yang diminta, selalu positif
  stockBefore: t.Number(),
  stockAfter: t.Number(),
  reason: nullableString,
});

/** Ringkasan hasil upload CSV (POST /api/stocks/bulk-adjustments). */
export const stockBulkAdjustmentResultModel = t.Object({
  total: t.Number(),
  successCount: t.Number(),
  failedCount: t.Number(),
  results: t.Array(
    t.Object({
      row: t.Number(), // nomor baris data, mulai dari 1 (header tidak dihitung)
      sku: t.String(),
      status: t.Union([t.Literal("success"), t.Literal("failed")]),
      error: t.Optional(t.String()),
    }),
  ),
});

/** Satu varian yang perlu di-restock (GET /api/stocks/reorder-list). */
export const stockReorderItemModel = t.Object({
  id: t.String(), // uuid varian (detail_products.id)
  name: t.String(), // nama produk induk
  sku: t.String(),
  image: nullableMediaModel, // gambar pertama varian, null bila belum ada
  inStock: t.Number(),
  reorderAt: nullableNumber, // = products.min_stock_alert, null bila belum diset
  status: t.Union([t.Literal("OUT_OF_STOCK"), t.Literal("RUNNING_LOW")]),
});

/** Status stok satu varian by SKU (GET /api/stocks/:sku/status). */
export const stockVariantStatusModel = t.Object({
  id: t.String(),
  sku: t.String(),
  name: t.String(), // "<nama produk> - <nama warna>"
  inStock: t.Number(),
});

/** Hasil satu order sales (POST /api/order-sales). */
export const orderSalesModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  orderDate: t.String(),
  customerId: t.String(),
  paymentMethod: t.String(),
  status: t.String(),
  createdVia: t.String(),
  shippingAddress: nullableString,
  shippingCity: nullableString,
  shippingProvince: nullableString,
  shippingZipCode: nullableString,
  shippingAmount: t.Number(),
  note: nullableString,
  totalAmount: t.Number(),
  total: t.Number(),
  items: t.Array(
    t.Object({
      detailProductId: t.String(),
      sku: t.String(),
      productName: t.String(),
      quantity: t.Number(),
      unitPrice: t.Number(),
      subtotal: t.Number(),
    }),
  ),
});

/** Agregat dashboard order (GET /api/order-sales/stats). */
export const orderSalesStatsModel = t.Object({
  totalRevenue: t.Number(),
  totalOrders: t.Number(),
  averageOrderValue: t.Number(),
  awaitingFulfillment: t.Number(),
  // Sebaran status. "awaitingFulfillment" = pending + processing (turunan).
  total: t.Object({
    allOrders: t.Number(),
    awaitingFulfillment: t.Number(),
    pending: t.Number(),
    processing: t.Number(),
    shipped: t.Number(),
    completed: t.Number(),
    cancelled: t.Number(),
  }),
});

/** Satu baris pada list order (GET /api/order-sales). */
export const orderSalesListItemModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  date: t.String(), // sales_orders.order_date, format YYYY-MM-DD
  customer: nullableString, // nama customer
  items: t.Object({
    total: t.Number(), // jumlah JENIS barang = banyaknya baris item, bukan SUM(quantity)
    productVariants: t.Array(
      t.Object({
        name: t.String(), // "<nama produk> - <nama warna>"
        imageUrl: nullableString,
        price: t.Number(), // unit_price snapshot saat order dibuat
      }),
    ),
  }),
  total: t.Number(),
  status: t.String(),
});

/** Detail satu order (GET /api/order-sales/:id). */
export const orderSalesDetailModel = t.Object({
  id: t.String(),
  invoiceNumber: t.String(),
  date: t.String(),
  customer: t.Object({
    id: t.String(),
    name: t.String(),
    email: t.String(),
    phone: t.String(),
    totalSpend: t.Number(), // customers.lifetime_value
  }),
  shipping: t.Object({
    address: nullableString,
    city: nullableString,
    zipCode: nullableString,
    province: nullableString,
    trackingNumber: nullableString,
  }),
  items: t.Array(
    t.Object({
      id: t.String(), // sales_order_items.id (BUKAN detail_product_id)
      detailProductId: t.String(),
      name: t.String(),
      sku: t.String(),
      imageUrl: nullableString,
      quantity: t.Number(),
      price: t.Number(),
      // null = belum pernah ditandai (baris sebelum migrasi). Frontend
      // memperlakukan null sama dengan false.
      isPacked: t.Union([t.Boolean(), t.Null()]),
    }),
  ),
  subtotal: t.Number(), // sales_orders.total_amount
  shippingCost: t.Number(), // sales_orders.shipping_amount ?? 0
  discount: t.Number(), // sales_orders.discount_amount ?? 0
  total: t.Number(),
  status: t.String(),
  internalNote: nullableString, // sales_orders.note
  // null bila jadwal pengiriman belum diisi sama sekali.
  delivery: t.Union([
    t.Object({
      deliveryDate: nullableString,
      timeSlot: nullableString,
      deliveryNotes: nullableString,
    }),
    t.Null(),
  ]),
});

/** Hasil PATCH /api/order-sales/:id/mark-as-packed. */
export const orderSalesPackedItemModel = t.Object({
  id: t.String(),
  isPacked: t.Boolean(),
});

/** Satu invoice siap dirender frontend (GET /api/order-sales/invoice). */
export const orderSalesInvoiceModel = t.Object({
  invoiceNumber: t.String(),
  date: t.String(),
  status: t.String(),
  paymentMethod: t.String(),
  company: t.Object({
    name: t.String(),
    address: t.String(),
    phone: t.String(),
    email: t.String(),
  }),
  customer: t.Object({
    name: t.String(),
    email: t.String(),
    phone: t.String(),
    address: nullableString,
    city: nullableString,
    province: nullableString,
    zipCode: nullableString,
  }),
  items: t.Array(
    t.Object({
      name: t.String(),
      sku: t.String(),
      quantity: t.Number(),
      unitPrice: t.Number(),
      subtotal: t.Number(),
    }),
  ),
  subtotal: t.Number(),
  shippingCost: t.Number(),
  discount: t.Number(),
  total: t.Number(),
  note: nullableString,
});

/** Ringkasan role yang ditempel di response administrator. */
const administratorRoleModel = t.Union([
  t.Object({ id: t.String(), name: t.String() }),
  t.Null(),
]);

/** Satu administrator utuh (POST, PATCH). TANPA password. */
export const administratorModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  roleId: nullableString,
  ...auditColumns,
});

/** Item pada list administrator (GET /administrators). */
export const administratorListItemModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  role: administratorRoleModel,
});

/** Detail satu administrator (GET /administrators/:id). */
export const administratorDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  role: administratorRoleModel,
});

/** Satu role utuh beserta permission code-nya (POST, PATCH). */
export const roleModel = t.Object({
  id: t.String(),
  name: t.String(),
  description: nullableString,
  permissions: t.Array(t.String()),
  ...auditColumns,
});

/** Item pada list role (GET /roles). */
export const roleListItemModel = t.Object({
  id: t.String(),
  name: t.String(),
  description: nullableString,
  permissions: t.Array(t.String()),
});

/** Detail satu role (GET /roles/:id). */
export const roleDetailModel = t.Object({
  id: t.String(),
  name: t.String(),
  description: nullableString,
  permissions: t.Array(t.String()),
});

/** Satu permission (GET /permissions). */
export const permissionModel = t.Object({
  id: t.String(),
  code: t.String(),
  module: nullableString,
  action: nullableString,
  description: nullableString,
});

/** GET /api/deliveries/stats */
export const deliveryStatsModel = t.Object({
  thisWeek: t.Number(), // jumlah delivery minggu berjalan (Senin–Minggu)
  overdue: t.Number(), // jumlah delivery yang lewat tanggal & belum dikirim
});

/** Customer ringkas pada baris delivery. Phone dipakai kurir untuk menghubungi. */
const deliveryCustomerModel = t.Object({
  id: nullableString,
  name: nullableString,
  phone: nullableString,
});

/** Detail pengiriman satu order. */
const deliveryShippingDetailModel = t.Object({
  address: nullableString,
  city: nullableString,
  province: nullableString,
  zipCode: nullableString,
  timeSlot: nullableString, // "morning" | "afternoon" | "evening" | null
  notes: nullableString,
  trackingNumber: nullableString,
});

/** Satu delivery di dalam sebuah hari. */
const deliveryItemModel = t.Object({
  id: t.String(), // sales_orders.id
  invoiceNumber: t.String(),
  status: t.String(),
  customer: deliveryCustomerModel,
  shippingDetail: deliveryShippingDetailModel,
});

/** Satu hari pada papan mingguan (GET /api/deliveries). Selalu 7 elemen. */
export const deliveryDayModel = t.Object({
  date: t.String(), // "YYYY-MM-DD"
  dayName: t.String(), // "monday" … "sunday"
  deliveries: t.Array(deliveryItemModel),
});

/** GET /api/deliveries — papan mingguan beserta rentang tanggal yang diminta. */
export const deliveryWeekModel = t.Object({
  date: t.Object({
    start: t.String(), // "YYYY-MM-DD", sama dengan query "start"
    end: t.String(), // "YYYY-MM-DD", sama dengan query "end"
  }),
  days: t.Array(deliveryDayModel),
});

/** Satu baris pada GET /api/deliveries/overdue. */
export const deliveryOverdueItemModel = t.Object({
  id: t.String(),
  date: t.String(), // delivery_date yang terlewat
  daysOverdue: t.Number(), // selisih hari terhadap hari ini, minimal 1
  invoiceNumber: t.String(),
  status: t.String(),
  customer: deliveryCustomerModel,
  city: nullableString, // sales_orders.shipping_city
});

/** Satu label pengiriman siap dirender frontend (GET /api/order-sales/shipping-label). */
export const orderSalesShippingLabelModel = t.Object({
  invoiceNumber: t.String(),
  date: t.String(),
  trackingNumber: nullableString,
  sender: t.Object({
    name: t.String(),
    address: t.String(),
    phone: t.String(),
    zipCode: t.String(),
  }),
  recipient: t.Object({
    name: t.String(),
    phone: t.String(),
    address: nullableString,
    city: nullableString,
    province: nullableString,
    zipCode: nullableString,
  }),
  // Perhatikan: di label pengiriman ini SUM(quantity) — jumlah unit fisik yang
  // dimasukkan ke paket. Beda arti dengan `items.total` di list order yang
  // menghitung jenis barang.
  totalItems: t.Number(),
  totalWeightGram: t.Number(),
  deliveryDate: nullableString,
  timeSlot: nullableString,
  deliveryNotes: nullableString,
});

/** Satu baris item penjualan marketplace (GET /api/marketplace/orders). */
export const marketplaceOrderItemModel = t.Object({
  id: t.String(), // sales_order_items.id
  orderId: t.String(),
  marketplace: nullableString,
  date: t.String(), // kolom `date` Postgres → string "YYYY-MM-DD"
  buyerName: nullableString,
  variantSku: t.String(),
  productName: t.String(),
  quantity: t.Number(),
  revenue: t.Number(), // = unitPrice * quantity
});

/** Hasil pencatatan satu order marketplace (POST /api/marketplace/log). */
export const marketplaceLogResultModel = t.Object({
  id: t.String(), // sales_orders.id
  orderId: t.String(),
  marketplace: nullableString,
  date: t.String(),
  buyerName: nullableString,
  totalRevenue: t.Number(), // = sales_orders.total_amount
  items: t.Array(
    t.Object({
      id: t.String(), // sales_order_items.id
      variantSku: t.String(),
      productName: t.String(),
      quantity: t.Number(),
      revenue: t.Number(),
    }),
  ),
});

/** Ringkasan hasil upload CSV (POST /api/marketplace/import). */
export const marketplaceImportResultModel = t.Object({
  total: t.Number(),
  successCount: t.Number(),
  failedCount: t.Number(),
  results: t.Array(
    t.Object({
      row: t.Number(), // nomor baris data, mulai dari 1 (header tidak dihitung)
      orderId: t.String(),
      variantSku: t.String(),
      status: t.Union([t.Literal("success"), t.Literal("failed")]),
      error: t.Optional(t.String()),
    }),
  ),
});
